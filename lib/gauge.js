/**
 * SVG semicircular health factor gauge.
 * Arc spans from 1.0 (red, left) to 3.0+ (green, right).
 */

/**
 * Build the gauge SVG markup.
 * @param {number} hf - health factor
 * @param {object} zone - { label, color, zone } from healthZone()
 * @returns {string} SVG markup
 */
function renderGauge(hf, zone) {
  const display = hf === Infinity ? '∞' : hf.toFixed(2);
  const clampedHf = Math.min(Math.max(hf === Infinity ? 3.01 : hf, 0.8), 3.0);
  const angle = ((clampedHf - 1.0) / 2.0) * 180; // 0° = left (HF=1), 180° = right (HF=3)

  const cx = 150;
  const cy = 140;
  const r = 110;

  // Needle end point
  const needleAngle = 180 - angle; // 180 = left, 0 = right
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleX = cx - r * 0.8 * Math.cos(needleRad);
  const needleY = cy - r * 0.8 * Math.sin(needleRad);

  // Arc paths — semicircle from left (180°) to right (0°)
  const arcStart = `M ${cx - r} ${cy}`;
  const arcEnd = `${cx + r} ${cy}`;

  // Zone arcs
  const zones = [
    { from: 1.0, to: 1.2, color: '#f87171' }, // red
    { from: 1.2, to: 1.4, color: '#fbbf24' }, // amber
    { from: 1.4, to: 1.5, color: '#a3e635' }, // lime
    { from: 1.5, to: 3.0, color: '#4ade80' }, // green
  ];

  const zoneArcs = zones.map(z => {
    const a1 = ((z.from - 1.0) / 2.0) * 180;
    const a2 = ((Math.min(z.to, 3.0) - 1.0) / 2.0) * 180;
    const r1 = ((180 - a1) * Math.PI) / 180;
    const r2 = ((180 - a2) * Math.PI) / 180;
    const x1 = cx - r * Math.cos(r1);
    const y1 = cy - r * Math.sin(r1);
    const x2 = cx - r * Math.cos(r2);
    const y2 = cy - r * Math.sin(r2);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}" stroke="${z.color}" stroke-width="16" fill="none" stroke-linecap="butt" opacity="0.85"/>`;
  }).join('');

  // Zone labels
  const labelData = [
    { hf: 1.0, text: '1.0' },
    { hf: 1.2, text: '1.2' },
    { hf: 1.4, text: '1.4' },
    { hf: 1.5, text: '1.5' },
    { hf: 3.0, text: '3.0' },
  ];
  const labels = labelData.map(l => {
    const a = ((l.hf - 1.0) / 2.0) * 180;
    const rad = ((180 - a) * Math.PI) / 180;
    const lx = cx - (r + 18) * Math.cos(rad);
    const ly = cy - (r + 18) * Math.sin(rad);
    return `<text x="${lx}" y="${ly + 4}" text-anchor="middle" fill="#888" font-size="10">${l.text}</text>`;
  }).join('');

  return `
    <div class="gauge-container">
      <svg viewBox="0 0 300 170" class="gauge-svg">
        ${zoneArcs}
        ${labels}
        <line x1="${cx}" y1="${cy}" x2="${needleX}" y2="${needleY}" stroke="${zone.color}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="6" fill="${zone.color}"/>
      </svg>
      <div class="gauge-readout" style="color: ${zone.color}">
        <span class="gauge-hf">${display}</span>
        <span class="gauge-label">${zone.label}</span>
      </div>
    </div>
  `;
}

// Expose as global
if (typeof window !== 'undefined') {
  window.renderGauge = renderGauge;
}
if (typeof module !== 'undefined') module.exports = { renderGauge };