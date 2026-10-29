import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const saleStorageKey = (userId) => `fordridge-pos-sale-v1-${userId}`
const priceStorageKey = (userId) => `fordridge-pos-price-v1-${userId}`

function readStored(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return { invalid: true } }
}

export default function InventoryPointOfSale({ profile, user, products, variants, quantities, onRefresh }) {
  const userId = user?.id || 'current-user'
  const [salePending, setSalePending] = useState(() => readStored(saleStorageKey(userId)))
  const [pricePending, setPricePending] = useState(() => readStored(priceStorageKey(userId)))
  const [priceDrafts, setPriceDrafts] = useState({})
  const [cart, setCart] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reportedMethod, setReportedMethod] = useState('')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState(null)
  const running = useRef(false)
  const isMainAdmin = profile?.role === 'admin'

  const activeProducts = useMemo(() => products.filter((product) => product.active), [products])
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId)
  const activeVariants = variants.filter((variant) => variant.product_id === selectedProductId && variant.active)
  const selectedBalanceKey = `${selectedProductId}:${selectedProduct?.tracks_variants ? selectedVariantId : 'product'}`
  const available = selectedProduct?.tracks_variants && !selectedVariantId ? 0 : quantities.get(selectedBalanceKey) || 0

  const loadHistory = useCallback(async () => {
    if (!isMainAdmin || !supabase) return
    const { data: sales, error: salesError } = await supabase.from('inventory_sales').select('*').order('created_at', { ascending: false }).limit(50)
    if (salesError) { setError(workflowError(salesError)); return }
    if (!sales?.length) { setHistory([]); return }
    const saleIds = sales.map((sale) => sale.id)
    const [{ data: lines, error: linesError }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase.from('inventory_sale_lines').select('*').in('sale_id', saleIds),
      supabase.from('inventory_sale_payments').select('*').in('sale_id', saleIds),
    ])
    if (linesError || paymentsError) { setError(workflowError(linesError || paymentsError)); return }
    setHistory(sales.map((sale) => ({ ...sale, lines: (lines || []).filter((line) => line.sale_id === sale.id), payment: (payments || []).find((payment) => payment.sale_id === sale.id) })))
  }, [isMainAdmin])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => {
    if (selectedProduct?.tracks_variants && !activeVariants.some((variant) => variant.id === selectedVariantId)) setSelectedVariantId('')
  }, [selectedProductId, selectedProduct?.tracks_variants, selectedVariantId, variants])

  function storeSale(request) {
    try { sessionStorage.setItem(saleStorageKey(userId), JSON.stringify(request)); setSalePending(request); return true }
    catch { setError('Enable browser session storage before submitting checkout.'); return false }
  }

  function clearSale() {
    try { sessionStorage.removeItem(saleStorageKey(userId)) } catch { /* Database state remains authoritative. */ }
    setSalePending(null)
  }

  async function runSale(request) {
    if (running.current || request?.invalid) return
    running.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc('record_inventory_sale', request)
      if (rpcError) {
        if (['22023', '42501', 'P0001', '23505'].includes(rpcError.code)) clearSale()
        throw rpcError
      }
      clearSale()
      setCart([])
      setReportedMethod('')
      setReceipt(data)
      setNotice('Sale and operator-reported payment were recorded together. Stock was deducted atomically.')
      await Promise.all([onRefresh(), loadHistory()])
    } catch (cause) { setError(workflowError(cause)) }
    finally { running.current = false; setBusy(false) }
  }

  async function submitCheckout(event) {
    event.preventDefault()
    if (busy || salePending || !cart.length || !reportedMethod.trim()) return
    const request = {
      p_request_id: crypto.randomUUID(),
      p_items: cart.map(({ product_id, variant_id, quantity: lineQuantity }) => ({ product_id, variant_id: variant_id || null, quantity: Number(lineQuantity) })),
      p_reported_method: reportedMethod.trim(),
    }
    if (storeSale(request)) await runSale(request)
  }

  async function savePrice(event, product) {
    event.preventDefault()
    if (busy || pricePending) return
    const draft = priceDrafts[product.id] || { unit_price: product.unit_price ?? '', currency: product.price_currency || 'USD' }
    const request = { p_request_id: crypto.randomUUID(), p_product_id: product.id, p_unit_price: Number(draft.unit_price), p_currency: draft.currency }
    try { sessionStorage.setItem(priceStorageKey(userId), JSON.stringify(request)); setPricePending(request) }
    catch { setError('Enable browser session storage before saving a product price.'); return }
    await runPrice(request)
  }

  async function runPrice(request) {
    if (running.current || request?.invalid) return
    running.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('set_inventory_product_price', request)
      if (rpcError) {
        if (['22023', '42501', '23505'].includes(rpcError.code)) clearPrice()
        throw rpcError
      }
      clearPrice()
      setNotice('Current selling price saved. Variant options inherit this product price.')
      await onRefresh()
    } catch (cause) { setError(workflowError(cause)) }
    finally { running.current = false; setBusy(false) }
  }

  function clearPrice() {
    try { sessionStorage.removeItem(priceStorageKey(userId)) } catch { /* Database state remains authoritative. */ }
    setPricePending(null)
  }

  function addToCart() {
    if (!selectedProduct || (selectedProduct.tracks_variants && !selectedVariantId)) return
    const count = Number(quantity)
    if (!Number.isInteger(count) || count < 1 || count > available) { setError(`Enter a whole quantity between 1 and ${available}.`); return }
    const key = `${selectedProduct.id}:${selectedVariantId || 'product'}`
    const existing = cart.find((line) => `${line.product_id}:${line.variant_id || 'product'}` === key)
    const nextCount = count + Number(existing?.quantity || 0)
    if (nextCount > available) { setError(`The cart cannot exceed the ${available} currently available.`); return }
    setError('')
    if (existing) setCart((current) => current.map((line) => `${line.product_id}:${line.variant_id || 'product'}` === key ? { ...line, quantity: nextCount } : line))
    else setCart((current) => [...current, { product_id: selectedProduct.id, variant_id: selectedVariantId || null, quantity: count }])
  }

  const cartLines = cart.map((line) => {
    const product = products.find((item) => item.id === line.product_id)
    const variant = variants.find((item) => item.id === line.variant_id)
    return { ...line, product, variant, balance: quantities.get(`${line.product_id}:${line.variant_id || 'product'}`) || 0,
      lineTotal: Number(product?.unit_price || 0) * Number(line.quantity) }
  })
  const currencies = [...new Set(cartLines.map((line) => line.product?.price_currency).filter(Boolean))]
  const currency = currencies[0] || ''
  const cartTotal = cartLines.reduce((sum, line) => sum + line.lineTotal, 0)
  const invalidCart = cartLines.some((line) => !line.product?.unit_price || Number(line.quantity) > line.balance || !line.product.active) || currencies.length !== 1

  if (!isMainAdmin) return <section className="workflow-panel inventory-pos"><h2>Point of sale</h2><p role="alert">Main Admin access is required for checkout until the school approves and configures a cashier role.</p></section>

  return <section className="workflow-panel inventory-pos" aria-labelledby="inventory-pos-title">
    <header><div><h2 id="inventory-pos-title">Point of sale</h2><p>Set a product's current selling price, build a stock-checked cart, and record the payment method reported by the operator. This does not charge a card or contact a payment processor.</p></div><button type="button" onClick={() => { onRefresh(); loadHistory() }} disabled={busy}>Refresh</button></header>
    {notice && <p className="workflow-success" role="status">{notice}</p>}{error && <p className="workflow-error" role="alert">{error}</p>}
    {pricePending && <div className="inventory-pos-recovery"><span>{pricePending.invalid ? 'Saved price request needs review.' : 'A price update is awaiting confirmation.'}</span>{!pricePending.invalid && <button type="button" disabled={busy} onClick={() => runPrice(pricePending)}>Retry saved price</button>}</div>}
    {salePending && <div className="inventory-pos-recovery"><span>{salePending.invalid ? 'Saved checkout needs review before another sale.' : 'A checkout is awaiting confirmation. Retry the same request to avoid a duplicate sale.'}</span>{!salePending.invalid && <button type="button" disabled={busy} onClick={() => runSale(salePending)}>Retry checkout</button>}</div>}
    <div className="inventory-pos-prices"><h3>Current selling prices</h3><p>Prices are not preloaded. Set the price and currency Fordridge has confirmed. Variant options inherit the product price.</p>
      {activeProducts.length ? activeProducts.map((product) => {
        const draft = priceDrafts[product.id] || { unit_price: product.unit_price ?? '', currency: product.price_currency || 'USD' }
        return <form className="inventory-pos-price-row" key={product.id} onSubmit={(event) => savePrice(event, product)}>
          <strong>{product.name}</strong><span>{product.price_currency ? `${product.price_currency} ${Number(product.unit_price).toFixed(2)}` : 'Price not set'}</span>
          <label>Unit price<input required type="number" min="0.01" max="9999999999.99" step="0.01" value={draft.unit_price} onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: { ...draft, unit_price: event.target.value } }))} /></label>
          <label>Currency<select value={draft.currency} onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: { ...draft, currency: event.target.value } }))}><option value="USD">USD</option><option value="ZiG">ZiG</option></select></label>
          <button type="submit" disabled={busy || Boolean(pricePending) || Boolean(salePending)}>{busy ? 'Saving…' : 'Save price'}</button>
        </form>
      }) : <p className="portal-empty-copy">Add a product before setting a selling price.</p>}
    </div>
    <form className="inventory-pos-build" onSubmit={(event) => { event.preventDefault(); addToCart() }}>
      <h3>Build cart</h3>
      <label>Product<select required value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setSelectedVariantId('') }}><option value="">Choose a product</option>{activeProducts.filter((product) => product.unit_price && product.price_currency).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.price_currency} {Number(product.unit_price).toFixed(2)}</option>)}</select></label>
      {selectedProduct?.tracks_variants && <label>Variant<select required value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)}><option value="">Choose a variant</option>{activeVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label} · {quantities.get(`${selectedProduct.id}:${variant.id}`) || 0} available</option>)}</select></label>}
      <label>Quantity<input required type="number" min="1" max={available || 1} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      {selectedProduct && <p className="inventory-pos-available">Available: {available.toLocaleString()} {selectedProduct.stock_unit}</p>}
      <button type="submit" disabled={!selectedProduct || (selectedProduct.tracks_variants && !selectedVariantId) || !available || busy || Boolean(salePending)}>Add to cart</button>
    </form>
    <form className="inventory-pos-cart" onSubmit={submitCheckout}>
      <h3>Checkout cart</h3>
      {cartLines.length ? <div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Line total</th><th>Action</th></tr></thead><tbody>{cartLines.map((line) => <tr key={`${line.product_id}:${line.variant_id || 'product'}`}><td>{line.product?.name || 'Product'}{line.variant && <small>{line.variant.label}</small>}</td><td>{line.quantity} {line.product?.stock_unit}</td><td>{line.product?.price_currency} {Number(line.product?.unit_price || 0).toFixed(2)}</td><td>{line.product?.price_currency} {line.lineTotal.toFixed(2)}</td><td><button type="button" onClick={() => setCart((current) => current.filter((item) => item.product_id !== line.product_id || item.variant_id !== line.variant_id))} disabled={busy}>Remove</button></td></tr>)}</tbody><tfoot><tr><th colSpan="3">Total</th><th>{currency} {cartTotal.toFixed(2)}</th><th /></tr></tfoot></table></div> : <p className="portal-empty-copy">Cart is empty.</p>}
      <label>Payment method reported by operator<input required maxLength={60} value={reportedMethod} onChange={(event) => setReportedMethod(event.target.value)} placeholder="For example, cash or bank transfer" /></label>
      <p>Payment is recorded as reported. Fordridge does not process or verify settlement in this checkout.</p>
      <button className="primary-action" disabled={busy || Boolean(salePending) || !cartLines.length || invalidCart || !reportedMethod.trim()}>{busy ? 'Recording sale…' : `Complete checkout · ${currency} ${cartTotal.toFixed(2)}`}</button>
    </form>
    {receipt && <article className="inventory-pos-receipt" aria-label="Sale receipt"><h3>Sale receipt</h3><p>Sale <code>{receipt.id}</code></p>{receipt.lines?.map((line, index) => <p key={`${line.product}-${line.variant}-${index}`}>{line.quantity} {line.unit} · {line.product}{line.variant ? ` · ${line.variant}` : ''} — {line.currency} {Number(line.line_total).toFixed(2)}</p>)}<strong>Total: {receipt.currency} {Number(receipt.total).toFixed(2)}</strong></article>}
    <div className="inventory-pos-history"><h3>Recent sales</h3>{history.length ? <div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>Date</th><th>Sale</th><th>Items</th><th>Paid record</th><th>Recorded by</th></tr></thead><tbody>{history.map((sale) => <tr key={sale.id}><td>{new Date(sale.created_at).toLocaleString('en-ZW')}</td><td><code>{sale.id}</code><small>{sale.currency} {Number(sale.total).toFixed(2)}</small></td><td><ul>{sale.lines.map((line) => <li key={line.id}>{line.quantity} × {line.product_name_snapshot}{line.variant_label_snapshot ? ` · ${line.variant_label_snapshot}` : ''}</li>)}</ul></td><td>{sale.payment?.reported_method || '—'}<small>{sale.payment ? `${sale.payment.currency} ${Number(sale.payment.amount).toFixed(2)} · operator reported` : 'No payment record'}</small></td><td>{sale.sold_by}</td></tr>)}</tbody></table></div> : <p className="portal-empty-copy">No sales have been recorded.</p>}</div>
  </section>
}
