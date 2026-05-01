import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet'
import { CBF_CAUSES, type LegacyCbfCause } from '../../features/legacy/cbfCauses.generated'
import { buildCauseDescriptionSentences } from '../../features/legacy/causeNarrative'
import { getLogoUrl } from '../../features/legacy/legacyCauseLogo'
import { sectorColor, sectorMeta } from '../../features/legacy/legacySectorMeta'

import 'leaflet/dist/leaflet.css'

type CbfCauseMapProps = {
  onOpenDetail: (id: number) => void
  causes?: LegacyCbfCause[]
}

export function CbfCauseMap({ onOpenDetail, causes = CBF_CAUSES }: CbfCauseMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<LeafletMap | null>(null)
  const markersRef = useRef<LeafletMarker[]>([])

  useEffect(() => {
    const el = mapRef.current
    if (!el) return

    let cancelled = false
    let map: LeafletMap | null = null

    void import('leaflet').then((leafletMod) => {
      if (cancelled || !mapRef.current) return
      const L = leafletMod.default ?? leafletMod

      map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([52.15, 5.3], 7)
      mapInstance.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map)

      causes.forEach((c) => {
        if (!c.lat || !c.lng) return
        const color = sectorColor(c.sector)
        const meta = sectorMeta(c.sector)
        const logoSrc = getLogoUrl(c)
        const innerHtml = logoSrc
          ? `<img src="${logoSrc}" style="width:26px;height:26px;object-fit:contain;border-radius:4px;" alt="" />`
          : `<span style="font-size:1.1rem">${meta.emoji}</span>`

        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#fff;border:2.5px solid ${color};border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;overflow:hidden;">${innerHtml}</div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
          popupAnchor: [0, -22],
        })

        const marker = L.marker([c.lat, c.lng], { icon }).addTo(map!)
        const preview = buildCauseDescriptionSentences(c, meta.label)
          .sentences.slice(0, 2)
          .join(' ')
        const popupHtml = `
      <div class="map-popup">
        <div style="font-size:.7rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">${meta.emoji} ${meta.label}</div>
        <h4>${escapeHtml(c.naam)}</h4>
        <p style="font-size:.68rem;font-weight:600;color:#0f766e;margin-bottom:6px;">CBF-erkend goed doel · ANBI (onder voorwaarden fiscaal voordelig)</p>
        <p style="font-size:.78rem;color:#666;margin-bottom:6px;">📍 ${escapeHtml(c.plaats || 'Nederland')} ${c.categorie ? `&nbsp;·&nbsp; CBF-cat. ${escapeHtml(String(c.categorie))}` : ''}</p>
        <p style="font-size:.8rem;color:#444;margin-bottom:10px;line-height:1.5;">${escapeHtml(preview || c.missie || '')}</p>
        <button type="button" class="map-popup-btn" data-cbf-open="${c.id}">Meer info & doneren →</button>
      </div>`
        marker.bindPopup(popupHtml, { maxWidth: 260 })
        marker.on('popupopen', () => {
          const node = marker.getPopup()?.getElement()
          const btn = node?.querySelector<HTMLButtonElement>('[data-cbf-open]')
          if (!btn) return
          const handler = () => {
            onOpenDetail(Number(btn.getAttribute('data-cbf-open')))
            map?.closePopup()
          }
          btn.addEventListener('click', handler, { once: true })
        })
        markersRef.current.push(marker)
      })

      window.setTimeout(() => map?.invalidateSize(), 300)
      window.setTimeout(() => map?.invalidateSize(), 600)
      window.setTimeout(() => map?.invalidateSize(), 1200)
    })

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => {
        try {
          m.remove()
        } catch {
          /* ignore */
        }
      })
      markersRef.current = []
      try {
        mapInstance.current?.remove()
      } catch {
        /* ignore */
      }
      mapInstance.current = null
    }
  }, [onOpenDetail, causes])

  return (
    <>
      <div className="map-legend" id="mapLegend">
        {sectorMetaEntries().map(([k, meta]) => (
          <div key={k} className="legend-item">
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: sectorColor(k),
                flexShrink: 0,
              }}
            />
            {meta.emoji} {meta.label}
          </div>
        ))}
      </div>
      <div id="causeMap" ref={mapRef} />
    </>
  )
}

function sectorMetaEntries(): Array<[string, ReturnType<typeof sectorMeta>]> {
  const keys = [
    'GEZONDHEID',
    'DIEREN',
    'DIEREN EN NATUUR',
    'NATUUR EN MILIEU',
    'MILIEU EN NATUUR',
    'WELZIJN',
    'SOCIAAL EN WELZIJN',
    'INTERNATIONALE HULP EN MENSENRECHTEN',
    'ONDERWIJS EN WETENSCHAP',
    'CULTUUR EN EDUCATIE',
  ]
  return keys.map((k) => [k, sectorMeta(k)])
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
