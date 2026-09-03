import { getDB } from './db.js'

/**
 * 전역 설정. Azure 키는 이 기기의 IndexedDB에만 있고
 * 코드·저장소·네트워크(Azure 외)로 절대 나가지 않는다.
 */
export const DEFAULT_SETTINGS = {
  azure_key: '',
  azure_region: '',
  accent: 'en-US', // 'en-US' 미국식 | 'en-GB' 영국식
}

export const ACCENTS = [
  { value: 'en-US', label: '미국식', voice: 'en-US-AvaMultilingualNeural' },
  { value: 'en-GB', label: '영국식', voice: 'en-GB-SoniaNeural' },
]

// 흔히 쓰는 Azure Speech 지역 (직접 입력도 가능하도록 datalist로 제공)
export const AZURE_REGIONS = [
  'eastus',
  'eastus2',
  'westus',
  'westus2',
  'westus3',
  'centralus',
  'southcentralus',
  'northcentralus',
  'canadacentral',
  'brazilsouth',
  'northeurope',
  'westeurope',
  'uksouth',
  'francecentral',
  'germanywestcentral',
  'switzerlandnorth',
  'swedencentral',
  'eastasia',
  'southeastasia',
  'japaneast',
  'japanwest',
  'koreacentral',
  'australiaeast',
  'centralindia',
  'uaenorth',
]

export async function loadSettings() {
  const db = await getDB()
  const rows = await db.getAll('settings')
  const out = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (row.key in out) out[row.key] = row.value
  }
  return out
}

export async function saveSetting(key, value) {
  const db = await getDB()
  await db.put('settings', { key, value })
}

export async function saveSettings(patch) {
  const db = await getDB()
  const tx = db.transaction('settings', 'readwrite')
  await Promise.all(
    Object.entries(patch).map(([key, value]) => tx.store.put({ key, value }))
  )
  await tx.done
}

/** 키를 화면에 그대로 뿌리지 않기 위한 표시용 마스킹 */
export function maskKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '•'.repeat(key.length)
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 24))}${key.slice(-4)}`
}

/**
 * 키·지역이 실제로 통하는지 확인한다.
 * Speech 리소스의 토큰 발급 엔드포인트를 호출한다 — 인식/합성이 아니므로
 * 크레딧이 소모되지 않고, 키와 지역이 맞는지만 즉시 알 수 있다.
 * 받은 토큰은 확인 용도로만 쓰고 저장하지 않는다.
 */
export async function testAzureCredentials(key, region) {
  const trimmedKey = (key || '').trim()
  const trimmedRegion = (region || '').trim().toLowerCase()

  if (!trimmedKey) return { ok: false, message: '키를 입력해 주세요.' }
  if (!trimmedRegion) return { ok: false, message: '지역을 입력해 주세요.' }

  const url = `https://${trimmedRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': trimmedKey },
    })
  } catch {
    // 네트워크 실패 / 존재하지 않는 지역이면 DNS 단계에서 막힌다
    return {
      ok: false,
      message: navigator.onLine
        ? '연결하지 못했습니다. 지역 이름이 맞는지 확인해 주세요.'
        : '인터넷에 연결되어 있지 않습니다.',
    }
  }

  if (res.ok) return { ok: true, message: '연결됐습니다. 키와 지역이 맞습니다.' }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: '키가 맞지 않습니다. Azure Portal에서 다시 확인해 주세요.' }
  }
  if (res.status === 404) {
    return { ok: false, message: '지역이 맞지 않습니다. 리소스가 만들어진 지역을 확인해 주세요.' }
  }
  if (res.status === 429) {
    return { ok: false, message: '요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: false, message: `연결하지 못했습니다. (오류 ${res.status})` }
}
