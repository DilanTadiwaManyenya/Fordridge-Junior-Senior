import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import './inventory-stock-receipts.css'

const pageSize = 500
const requestKinds = ['product', 'variant', 'receipt', 'adjustment']
const rpcNames = {
  product: 'create_inventory_product',
  variant: 'add_inventory_product_variant',
  receipt: 'record_inventory_stock_receipt',
  adjustment: 'adjust_inventory_stock',
}

function readSavedRequest(key) {
  try {
    const saved = sessionStorage.getItem(key)
    return saved ? JSON.parse(saved) : null
  } catch {
    return { invalid: true }
  }
}

async function readAll(table, orderColumn) {
  const results = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select('*').order(orderColumn, { ascending: false }).range(offset, offset + pageSize - 1)
    if (error) throw error
    results.push(...(data || []))
    if (!data || data.length < pageSize) return results
  }
}

const blankLine = () => ({ product_id: '', variant_id: '', quantity: '', unit_cost: '', cost_currency: '' })
const blankProduct = () => ({ name: '', sku: '', category: '', stock_unit: '', tracks_variants: false })

export default function InventoryStockReceipts({ profile, user }) {
  const userId = user?.id || 'current-user'
  const isMainAdmin = profile?.role === 'admin'
  const storageKey = useCallback((kind) => `fordridge-inventory-${kind}-v1-${userId}`, [userId])
  const [products, setProducts] = useState([])
  const [variants, setVariants] = useState([])
  const [movements, setMovements] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [receipts, setReceipts] = useState([])
  const [receiptLines, setReceiptLines] = useState([])
  const [productDraft, setProductDraft] = useState(blankProduct)
  const [variantDrafts, setVariantDrafts] = useState({})
  const [receiptDraft, setReceiptDraft] = useState({ receipt_kind: 'supplier_delivery', supplier_name: '', supplier_reference: '', notes: '', items: [blankLine()] })
  const [adjustmentDraft, setAdjustmentDraft] = useState(null)
  const [pending, setPending] = useState(() => Object.fromEntries(requestKinds.map((kind) => [kind, readSavedRequest(`fordridge-inventory-${kind}-v1-${userId}`)])))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const running = useRef(false)

  const load = useCallback(async () => {
    if (!isMainAdmin) {
      setLoading(false)
      return
    }
    if (!supabase) {
      setError('Inventory service is not configured.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [nextProducts, nextVariants, nextMovements, nextReceipts, nextLines, nextAdjustments] = await Promise.all([
        readAll('inventory_products', 'created_at'),
        readAll('inventory_product_variants', 'created_at'),
        readAll('inventory_stock_movements', 'created_at'),
        readAll('inventory_stock_receipts', 'created_at'),
        readAll('inventory_stock_receipt_lines', 'created_at'),
        readAll('inventory_stock_adjustments', 'created_at'),
      ])
      setProducts(nextProducts)
      setVariants(nextVariants)
      setMovements(nextMovements)
      setReceipts(nextReceipts)
      setReceiptLines(nextLines)
      setAdjustments(nextAdjustments)
    } catch (cause) {
      setError(workflowError(cause))
    } finally {
      setLoading(false)
    }
  }, [isMainAdmin])

  useEffect(() => { load() }, [load])

  const quantities = useMemo(() => movements.reduce((totals, movement) => {
    const key = `${movement.product_id}:${movement.variant_id || 'product'}`
    totals.set(key, (totals.get(key) || 0) + Number(movement.quantity_delta || 0))
    return totals
  }, new Map()), [movements])
  const variantsByProduct = useMemo(() => variants.reduce((grouped, variant) => {
    const list = grouped.get(variant.product_id) || []
    list.push(variant)
    grouped.set(variant.product_id, list)
    return grouped
  }, new Map()), [variants])
  const linesByReceipt = useMemo(() => receiptLines.reduce((grouped, line) => {
    const list = grouped.get(line.receipt_id) || []
    list.push(line)
    grouped.set(line.receipt_id, list)
    return grouped
  }, new Map()), [receiptLines])

  function storeRequest(kind, request) {
    try {
      sessionStorage.setItem(storageKey(kind), JSON.stringify(request))
      setPending((current) => ({ ...current, [kind]: request }))
      return true
    } catch {
      setError('Enable browser session storage before submitting this inventory action.')
      return false
    }
  }

  function clearRequest(kind) {
    try { sessionStorage.removeItem(storageKey(kind)) } catch { /* Database state remains authoritative. */ }
    setPending((current) => ({ ...current, [kind]: null }))
  }

  async function runRequest(kind, request) {
    if (running.current || request?.invalid) return
    running.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc(rpcNames[kind], request)
      if (rpcError) {
        if (['22023', '42501', 'P0001', '23505'].includes(rpcError.code)) clearRequest(kind)
        throw rpcError
      }
      clearRequest(kind)
      if (kind === 'product') {
        setProductDraft(blankProduct())
        setNotice('Product created with no stock. Record an opening balance or supplier delivery to add quantities.')
      } else if (kind === 'variant') {
        setVariantDrafts((current) => ({ ...current, [request.p_product_id]: '' }))
        setNotice('Variant added. No stock was assigned to it.')
      } else if (kind === 'adjustment') {
        const delta = Number(data?.quantity_delta ?? request.p_quantity_delta)
        setAdjustmentDraft(null)
        setNotice(`Stock adjusted by ${delta > 0 ? '+' : ''}${delta}. Balance: ${Number(data?.quantity_before || 0).toLocaleString()} → ${Number(data?.quantity_after || 0).toLocaleString()}. Reason recorded.`)
      } else {
        setReceiptDraft({ receipt_kind: 'supplier_delivery', supplier_name: '', supplier_reference: '', notes: '', items: [blankLine()] })
        setNotice(`Stock receipt recorded${data ? ` · ${data}` : ''}. Quantities are available in the movement ledger.`)
      }
      await load()
    } catch (cause) {
      setError(workflowError(cause))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  async function submitProduct(event) {
    event.preventDefault()
    if (busy || Object.values(pending).some(Boolean)) return
    const request = {
      p_request_id: crypto.randomUUID(),
      p_name: productDraft.name.trim(),
      p_sku: productDraft.sku.trim() || null,
      p_category: productDraft.category.trim() || null,
      p_stock_unit: productDraft.stock_unit.trim(),
      p_tracks_variants: productDraft.tracks_variants,
    }
    if (storeRequest('product', request)) await runRequest('product', request)
  }

  async function submitVariant(event, productId) {
    event.preventDefault()
    const request = {
      p_request_id: crypto.randomUUID(),
      p_product_id: productId,
      p_label: (variantDrafts[productId] || '').trim(),
      p_sku: null,
    }
    if (storeRequest('variant', request)) await runRequest('variant', request)
  }

  async function submitReceipt(event) {
    event.preventDefault()
    if (busy || Object.values(pending).some(Boolean)) return
    const items = receiptDraft.items.map((line) => ({
      product_id: line.product_id,
      variant_id: line.variant_id || null,
      quantity: line.quantity,
      unit_cost: line.unit_cost === '' ? null : line.unit_cost,
      cost_currency: line.unit_cost === '' ? null : line.cost_currency,
    }))
    const request = {
      p_request_id: crypto.randomUUID(),
      p_receipt_kind: receiptDraft.receipt_kind,
      p_supplier_name: receiptDraft.receipt_kind === 'supplier_delivery' ? receiptDraft.supplier_name.trim() : null,
      p_supplier_reference: receiptDraft.supplier_reference.trim() || null,
      p_notes: receiptDraft.notes.trim() || null,
      p_items: items,
    }
    if (storeRequest('receipt', request)) await runRequest('receipt', request)
  }

  async function submitAdjustment(event) {
    event.preventDefault()
    if (!adjustmentDraft || busy || Object.values(pending).some(Boolean)) return
    const request = {
      p_request_id: crypto.randomUUID(),
      p_product_id: adjustmentDraft.product_id,
      p_variant_id: adjustmentDraft.variant_id || null,
      p_quantity_delta: Number(adjustmentDraft.quantity_delta),
      p_reason: adjustmentDraft.reason.trim(),
    }
    if (storeRequest('adjustment', request)) await runRequest('adjustment', request)
  }

  function startAdjustment(product, variant = null) {
    setError('')
    setNotice('')
    setAdjustmentDraft({ product_id: product.id, variant_id: variant?.id || '', quantity_delta: '', reason: '' })
  }

  function updateReceiptLine(index, updates) {
    setReceiptDraft((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...updates } : line) }))
  }

  if (!isMainAdmin) return <section className="inventory-stock-receipts"><h1>Inventory &amp; POS</h1><p role="alert">Main Admin access is required to manage the stock catalogue and receipts.</p></section>

  return <section className="inventory-stock-receipts" aria-labelledby="inventory-stock-title">
    <header className="workflow-heading"><div><p className="eyebrow">Inventory &amp; POS</p><h1 id="inventory-stock-title">Stock receipts</h1><p className="progress-report-note">Create empty product records, then record each supplier delivery or opening balance with an auditable source.</p></div><button type="button" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></header>
    <aside className="inventory-stock-notice">This stage records stock only. It does not enable checkout, payment processing, campus allocation, or parent ordering. Enter only school-confirmed products and quantities. Adjustments require a reason and are recorded as signed stock movements.</aside>
    {notice && <p className="workflow-success" role="status">{notice}</p>}
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {Object.entries(pending).filter(([, request]) => request).map(([kind, request]) => <section className="inventory-stock-recovery" key={kind} aria-label={`${kind} recovery`}>
      <div><strong>{request.invalid ? 'Saved request needs review' : `${kind[0].toUpperCase()}${kind.slice(1)} request awaiting confirmation`}</strong><p>{request.invalid ? 'The saved request could not be read. Refresh and reconcile the catalogue before creating another record.' : 'Retry the same request to confirm its result without duplicating a record.'}</p></div>
      {!request.invalid && <button type="button" disabled={busy} onClick={() => runRequest(kind, request)}>Retry saved request</button>}
    </section>)}
    <div className="inventory-stock-summary"><article><span>Products</span><strong>{products.length}</strong><small>School-entered records only</small></article><article><span>Net stock movement</span><strong>{movements.reduce((sum, movement) => sum + Number(movement.quantity_delta || 0), 0).toLocaleString()}</strong><small>Receipts plus signed adjustments</small></article><article><span>Receipts</span><strong>{receipts.length}</strong><small>Supplier and opening entries</small></article></div>

    {adjustmentDraft && <form className="workflow-panel workflow-form inventory-adjustment-form" onSubmit={submitAdjustment}>
      {(() => {
        const product = products.find((item) => item.id === adjustmentDraft.product_id)
        const variant = variants.find((item) => item.id === adjustmentDraft.variant_id)
        const key = `${adjustmentDraft.product_id}:${adjustmentDraft.variant_id || 'product'}`
        const current = quantities.get(key) || 0
        const delta = adjustmentDraft.quantity_delta === '' ? null : Number(adjustmentDraft.quantity_delta)
        const next = delta == null ? current : current + delta
        const validDelta = Number.isInteger(delta) && delta !== 0 && Math.abs(delta) <= 9999999 && next >= 0
        return <>
          <h2>Adjust stock</h2>
          <p>{product?.name}{variant ? ` · ${variant.label}` : ''} currently has <strong>{current.toLocaleString()} {product?.stock_unit}</strong>. Positive values add stock; negative values remove it. The adjustment and reason are retained in the audit history.</p>
          <label>Signed quantity change<input autoFocus required type="number" min="-9999999" max="9999999" step="1" value={adjustmentDraft.quantity_delta} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, quantity_delta: event.target.value })} aria-describedby="inventory-adjustment-preview" /></label>
          <label className="inventory-wide">Reason<textarea required minLength="5" maxLength="1000" value={adjustmentDraft.reason} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, reason: event.target.value })} placeholder="Explain the verified stock count or correction" /></label>
          <p className={`inventory-adjustment-preview${delta != null && next < 0 ? ' is-invalid' : ''}`} id="inventory-adjustment-preview">{delta == null ? `Current balance: ${current.toLocaleString()}` : `New balance: ${next.toLocaleString()} ${product?.stock_unit}`}{delta != null && next < 0 ? ' — balance cannot be negative.' : ''}</p>
          <div className="workflow-actions inventory-wide"><button className="primary-action" disabled={busy || Object.values(pending).some(Boolean) || !validDelta || adjustmentDraft.reason.trim().length < 5}>{busy ? 'Saving…' : 'Save adjustment'}</button><button type="button" onClick={() => setAdjustmentDraft(null)} disabled={busy}>Cancel</button></div>
        </>
      })()}
    </form>}

    <form className="workflow-panel workflow-form inventory-product-form" onSubmit={submitProduct}>
      <h2>Add product</h2><p>New products start with zero stock. No sample categories, products, SKUs, sizes, prices, or campus values are preloaded.</p>
      <label>Product name<input required maxLength={160} value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} /></label>
      <label>Category (optional)<input maxLength={100} value={productDraft.category} onChange={(event) => setProductDraft({ ...productDraft, category: event.target.value })} /></label>
      <label>SKU (optional)<input maxLength={80} value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value })} /></label>
      <label>Stock unit<input required maxLength={40} value={productDraft.stock_unit} onChange={(event) => setProductDraft({ ...productDraft, stock_unit: event.target.value })} placeholder="Enter the school-approved unit" /></label>
      <label>Stock tracking<select value={productDraft.tracks_variants ? 'variants' : 'single'} onChange={(event) => setProductDraft({ ...productDraft, tracks_variants: event.target.value === 'variants' })}><option value="single">One balance for this product</option><option value="variants">Separate variants (for example, sizes)</option></select></label>
      <div className="workflow-actions"><button className="primary-action" disabled={busy || Object.values(pending).some(Boolean)}>{busy ? 'Saving…' : 'Create product'}</button></div>
    </form>

    <form className="workflow-panel workflow-form inventory-receipt-form" onSubmit={submitReceipt}>
      <h2>Record stock receipt</h2><p>Supplier deliveries require a supplier and known unit cost. Opening stock requires a reason; unknown historic cost can remain blank.</p>
      <label>Receipt type<select value={receiptDraft.receipt_kind} onChange={(event) => setReceiptDraft({ ...receiptDraft, receipt_kind: event.target.value })}><option value="supplier_delivery">Supplier delivery</option><option value="opening_stock">Opening stock</option></select></label>
      {receiptDraft.receipt_kind === 'supplier_delivery' && <label>Supplier name<input required maxLength={200} value={receiptDraft.supplier_name} onChange={(event) => setReceiptDraft({ ...receiptDraft, supplier_name: event.target.value })} /></label>}
      <label>Supplier reference (optional)<input maxLength={120} value={receiptDraft.supplier_reference} onChange={(event) => setReceiptDraft({ ...receiptDraft, supplier_reference: event.target.value })} /></label>
      <label className="inventory-wide">{receiptDraft.receipt_kind === 'opening_stock' ? 'Reason for opening balance' : 'Notes (optional)'}<textarea required={receiptDraft.receipt_kind === 'opening_stock'} minLength={receiptDraft.receipt_kind === 'opening_stock' ? 5 : undefined} maxLength={1000} value={receiptDraft.notes} onChange={(event) => setReceiptDraft({ ...receiptDraft, notes: event.target.value })} /></label>
      <div className="inventory-receipt-lines inventory-wide"><div className="inventory-receipt-lines-heading"><h3>Products and quantities</h3><button type="button" onClick={() => setReceiptDraft((current) => ({ ...current, items: [...current.items, blankLine()] }))} disabled={busy}>Add line</button></div>
        {receiptDraft.items.map((line, index) => {
          const product = products.find((item) => item.id === line.product_id)
          const productVariants = variantsByProduct.get(product?.id) || []
          return <div className="inventory-receipt-line" key={`receipt-line-${index}`}>
            <label>Product<select required value={line.product_id} onChange={(event) => updateReceiptLine(index, { product_id: event.target.value, variant_id: '', unit_cost: '', cost_currency: '' })}><option value="">Choose a product</option>{products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stock_unit}{item.tracks_variants ? ' · variants' : ''}</option>)}</select></label>
            {product?.tracks_variants && <label>Variant<select required value={line.variant_id} onChange={(event) => updateReceiptLine(index, { variant_id: event.target.value })}><option value="">Choose a variant</option>{productVariants.filter((variant) => variant.active).map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></label>}
            <label>Quantity<input required type="number" min="1" max="9999999" step="1" value={line.quantity} onChange={(event) => updateReceiptLine(index, { quantity: event.target.value })} /></label>
            <label>Unit cost {receiptDraft.receipt_kind === 'opening_stock' ? '(optional)' : ''}<input required={receiptDraft.receipt_kind === 'supplier_delivery'} type="number" min="0" max="9999999999.99" step="0.01" value={line.unit_cost} onChange={(event) => updateReceiptLine(index, { unit_cost: event.target.value, cost_currency: event.target.value === '' ? '' : line.cost_currency })} /></label>
            {line.unit_cost !== '' && <label>Cost currency<select required value={line.cost_currency} onChange={(event) => updateReceiptLine(index, { cost_currency: event.target.value })}><option value="">Choose currency</option><option>USD</option><option>ZiG</option></select></label>}
            {receiptDraft.items.length > 1 && <button type="button" className="inventory-remove-line" onClick={() => setReceiptDraft((current) => ({ ...current, items: current.items.filter((_, lineIndex) => lineIndex !== index) }))} disabled={busy}>Remove line</button>}
          </div>
        })}
      </div>
      <div className="workflow-actions inventory-wide"><button className="primary-action" disabled={busy || Object.values(pending).some(Boolean) || !products.length}>{busy ? 'Recording…' : 'Record stock receipt'}</button></div>
    </form>

    <section className="workflow-panel inventory-products-panel"><header><div><h2>Catalogue and current stock</h2><p>Stock is the sum of auditable receipt movements. This is not available for checkout in this stage.</p></div></header>
      {loading ? <p role="status">Loading catalogue…</p> : products.length ? <div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>Product</th><th>SKU / category</th><th>Stock unit</th><th>Current stock</th><th>Variants</th><th>Actions</th></tr></thead><tbody>{products.map((product) => {
        const productVariants = variantsByProduct.get(product.id) || []
        const total = product.tracks_variants
          ? productVariants.reduce((sum, variant) => sum + (quantities.get(`${product.id}:${variant.id}`) || 0), 0)
          : quantities.get(`${product.id}:product`) || 0
        return <tr key={product.id}><td><strong>{product.name}</strong>{!product.active && <small>Archived</small>}</td><td>{product.sku || '—'}<small>{product.category || 'Category unset'}</small></td><td>{product.stock_unit}</td><td>{total.toLocaleString()}</td><td>{product.tracks_variants ? <><ul className="inventory-variant-list">{productVariants.map((variant) => <li key={variant.id}>{variant.label}: {quantities.get(`${product.id}:${variant.id}`) || 0} {product.stock_unit}<button type="button" onClick={() => startAdjustment(product, variant)} disabled={!product.active || !variant.active || busy}>Adjust</button></li>)}</ul><form className="inventory-add-variant" onSubmit={(event) => submitVariant(event, product.id)}><input required maxLength={40} aria-label={`New variant for ${product.name}`} placeholder="Add variant label" value={variantDrafts[product.id] || ''} onChange={(event) => setVariantDrafts((current) => ({ ...current, [product.id]: event.target.value }))} /><button type="submit" disabled={busy || Object.values(pending).some(Boolean)}>Add</button></form></> : 'Single balance'}</td><td>{!product.tracks_variants && <button type="button" className="inventory-adjust-button" onClick={() => startAdjustment(product)} disabled={!product.active || busy}>Adjust stock</button>}</td></tr>
      })}</tbody></table></div> : <p className="portal-empty-copy">No products exist yet. Add only school-confirmed catalogue items.</p>}
    </section>

    <section className="workflow-panel inventory-receipt-history"><header><div><h2>Receipt history</h2><p>Each entry preserves its source, actor, quantities, unit, variant, and any known purchase cost.</p></div></header>
      {loading ? <p role="status">Loading receipt history…</p> : receipts.length ? <div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>Date / type</th><th>Source</th><th>Items</th><th>Recorded by</th></tr></thead><tbody>{receipts.map((receipt) => {
        const lines = linesByReceipt.get(receipt.id) || []
        return <tr key={receipt.id}><td>{new Date(receipt.created_at).toLocaleString('en-ZW')}<small>{receipt.receipt_kind === 'supplier_delivery' ? 'Supplier delivery' : 'Opening stock'}</small></td><td>{receipt.supplier_name || 'Opening balance'}<small>{receipt.supplier_reference || receipt.notes || 'No reference entered'}</small></td><td><ul className="inventory-history-lines">{lines.map((line) => <li key={line.id}>{line.quantity_received} {line.stock_unit_snapshot} · {line.product_name_snapshot}{line.variant_label_snapshot ? ` · ${line.variant_label_snapshot}` : ''}{line.unit_cost == null ? ' · cost unknown' : ` · ${line.cost_currency} ${Number(line.unit_cost).toFixed(2)} per ${line.stock_unit_snapshot}`}</li>)}</ul></td><td>{receipt.received_by}</td></tr>
      })}</tbody></table></div> : <p className="portal-empty-copy">No stock receipts have been recorded.</p>}
    </section>

    <section className="workflow-panel inventory-receipt-history"><header><div><h2>Stock adjustment history</h2><p>Signed corrections retain the balance before and after, reason, actor, and timestamp.</p></div></header>
      {loading ? <p role="status">Loading adjustment history…</p> : adjustments.length ? <div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>Date</th><th>Product / variant</th><th>Change</th><th>Balance</th><th>Reason</th><th>Recorded by</th></tr></thead><tbody>{adjustments.map((adjustment) => {
        const product = products.find((item) => item.id === adjustment.product_id)
        const variant = variants.find((item) => item.id === adjustment.variant_id)
        return <tr key={adjustment.id}><td>{new Date(adjustment.created_at).toLocaleString('en-ZW')}</td><td>{product?.name || 'Product'}{variant ? ` · ${variant.label}` : ''}</td><td>{adjustment.quantity_delta > 0 ? '+' : ''}{adjustment.quantity_delta} {product?.stock_unit || ''}</td><td>{Number(adjustment.quantity_before).toLocaleString()} → {Number(adjustment.quantity_after).toLocaleString()}</td><td>{adjustment.reason}</td><td>{adjustment.actor_id}</td></tr>
      })}</tbody></table></div> : <p className="portal-empty-copy">No stock adjustments have been recorded.</p>}
    </section>
  </section>
}
