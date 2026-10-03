import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icons'

// Lazy-loaded (React.lazy) so the camera code and the ZXing ponyfill never
// weigh on the main bundle. iOS Safari has no BarcodeDetector, hence the
// ponyfill; its .wasm is served from our own origin, not a CDN.

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

async function loadDetector(): Promise<DetectorCtor> {
  const native = (globalThis as { BarcodeDetector?: DetectorCtor & { getSupportedFormats(): Promise<string[]> } }).BarcodeDetector
  if (native && (await native.getSupportedFormats()).includes('ean_13')) return native
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  })
  return BarcodeDetector as unknown as DetectorCtor
}

export default function BarcodeScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'no-camera'>('starting')
  const [manual, setManual] = useState('')
  const done = useRef(false)
  // The parent passes a fresh callback each render; the camera must not restart for that.
  const report = useRef(onCode)
  useEffect(() => {
    report.current = onCode
  })

  useEffect(() => {
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    void (async () => {
      try {
        const Ctor = await loadDetector()
        const detector = new Ctor({ formats: FORMATS })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        setStatus('scanning')
        const tick = async () => {
          if (stopped || done.current || !video.current) return
          try {
            const hit = (await detector.detect(video.current)).find((c) => /^\d{8,14}$/.test(c.rawValue))
            if (hit) {
              done.current = true
              report.current(hit.rawValue)
              return
            }
          } catch {
            // A frame that can't be read yet — keep going.
          }
          timer = setTimeout(() => void tick(), 180)
        }
        void tick()
      } catch {
        if (!stopped) setStatus('no-camera')
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const code = manual.replace(/\D/g, '')

  return (
    <div className="scanner">
      {status !== 'no-camera' ? (
        <div className="scanner-view">
          <video ref={video} playsInline muted autoPlay aria-label="Camera preview" />
          <div className="scanner-frame" aria-hidden="true" />
          <p className="scanner-hint">{status === 'starting' ? 'Starting camera…' : 'Point at the barcode'}</p>
        </div>
      ) : (
        <p className="notice">Camera isn’t available here. Type the number under the barcode instead.</p>
      )}

      <form
        className="row-gap"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length >= 8) {
            done.current = true
            onCode(code)
          }
        }}
      >
        <input
          className="input grow num"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Barcode number"
          aria-label="Barcode number"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={code.length < 8}>
          Look up
        </button>
      </form>
      <button type="button" className="btn btn-quiet full" onClick={onCancel}>
        <Icon name="close" size={18} />
        Cancel
      </button>
    </div>
  )
}
