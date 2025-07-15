import Cookies from 'js-cookie'
import { v7 as uuidv7 } from 'uuid'
import { getAudioFp } from '@mdrv/m/v254/dom'
// Mandatory for interacting with WebSocket server
export const ensureBrowserId = () => {
    // default to always renew expiration date
    // + localStorage as backup
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    Cookies.set('browser_id', Cookies.get('browser_id') ?? localStorage.getItem('browser_id') ?? uuidv7(), {
        sameSite: 'Strict',
        secure: true,
        path: '/',
        expires: nextYear,
    })
    localStorage.setItem('browser_id', Cookies.get('browser_id')!)
}

export const ensureAudioFp = async () => {
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)

    Cookies.set('audio_fp', await getAudioFp('SHA-1'), {
        sameSite: 'Strict',
        secure: true,
        path: '/',
        expires: nextYear,
    })
}
