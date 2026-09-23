import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js'

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const countries = getCountries().sort((left, right) => countryNames.of(left).localeCompare(countryNames.of(right)))

export function toE164(value, country = 'ZW') {
  const phone = parsePhoneNumberFromString(value, country)
  return phone?.isValid() ? phone.number : null
}

export default function PhoneNumberField({ id = 'phone', value, onChange, country, onCountryChange, required = true }) {
  return <label htmlFor={id}>Phone number
    <span className="phone-fields">
      <select aria-label="Country calling code" value={country} onChange={event => onCountryChange(event.target.value)}>
        {countries.map(code => <option key={code} value={code}>{countryNames.of(code)} (+{getCountryCallingCode(code)})</option>)}
      </select>
      <input id={id} type="tel" value={value} onChange={event => onChange(event.target.value)} placeholder="78 760 1136" autoComplete="tel-national" required={required} />
    </span>
  </label>
}
