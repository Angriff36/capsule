import { code39Bars, code39Text } from "../lib/code39";

const BAR_HEIGHT = 56;
const QUIET = 10;

function labelSvg(code: string): string {
  const { bars, width } = code39Bars(code);
  const rects = bars
    .map(
      (bar) =>
        `<rect x="${bar.x + QUIET}" y="0" width="${bar.width}" height="${BAR_HEIGHT}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width + QUIET * 2} ${BAR_HEIGHT}" preserveAspectRatio="none" fill="#000">${rects}</svg>`;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

/**
 * A printable bar label (Code 39): the bars, the code in letters under them,
 * and what the label is stuck on. Any USB scanner or phone camera reads it;
 * the Scan box on a load sheet finds the matching pack line.
 */
export function BarcodeLabel({
  code,
  title,
  subtitle,
}: {
  /** What the scanner reads. Capitals, digits, space and - . $ / + %. */
  code: string;
  title: string;
  subtitle?: string;
}) {
  const text = code39Text(code);
  const { bars, width } = code39Bars(code);

  const print = () => {
    const page = window.open("", "_blank", "width=480,height=360");
    if (!page) return;
    page.document.write(
      `<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}svg{width:100%;max-width:420px;height:96px}h1{font-size:20px;margin:12px 0 4px}p{margin:0;font-size:14px}code{font-size:18px;letter-spacing:0.2em}</style></head><body>${labelSvg(code)}<p><code>${escapeHtml(text)}</code></p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</body></html>`,
    );
    page.document.close();
    page.focus();
    page.print();
  };

  return (
    <div className="barcode-label">
      <svg
        viewBox={`0 0 ${width + QUIET * 2} ${BAR_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Bar label ${text}`}
      >
        <rect width={width + QUIET * 2} height={BAR_HEIGHT} fill="#fff" />
        {bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x + QUIET}
            y={0}
            width={bar.width}
            height={BAR_HEIGHT}
            fill="#000"
          />
        ))}
      </svg>
      <p className="barcode-label-code">{text}</p>
      <p className="barcode-label-title">{title}</p>
      {subtitle ? <p className="barcode-label-subtitle">{subtitle}</p> : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={print}>
        Print label
      </button>
    </div>
  );
}
