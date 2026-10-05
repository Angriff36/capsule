import QRCode from "qrcode";
import { code39Bars, code39Text } from "../lib/code39";

const BAR_HEIGHT = 56;
const QUIET = 10;

function labelSvg(carried: string): string {
  const { bars, width } = code39Bars(carried);
  const rects = bars
    .map(
      (bar) =>
        `<rect x="${bar.x + QUIET}" y="0" width="${bar.width}" height="${BAR_HEIGHT}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width + QUIET * 2} ${BAR_HEIGHT}" preserveAspectRatio="none" fill="#000">${rects}</svg>`;
}

/** The dark squares of a QR code, one unit each, with a two-unit margin. */
function qrSquares(value: string): {
  size: number;
  squares: Array<[number, number]>;
} {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const squares: Array<[number, number]> = [];
  for (let row = 0; row < modules.size; row += 1)
    for (let column = 0; column < modules.size; column += 1)
      if (modules.get(row, column)) squares.push([column + 2, row + 2]);
  return { size: modules.size + 4, squares };
}

function qrSvg(value: string): string {
  const { size, squares } = qrSquares(value);
  const rects = squares
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1"/>`)
    .join("");
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
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
 * A printable label for a piece of equipment, a truck or an event: a bar
 * label (Code 39) with the code in letters under it, a QR code, or both, and
 * what the label is stuck on. Any USB scanner or phone camera reads it; the
 * Scan box on a load sheet finds the matching pack line. The QR code carries
 * the record itself, so it still reads when two tags look alike.
 */
export function BarcodeLabel({
  code,
  qr,
  title,
  subtitle,
}: {
  /** The tag or number as people write it; the bars carry it without loss. */
  code?: string;
  /** What the QR code carries, e.g. "capsule://equipment/<id>". */
  qr?: string;
  title: string;
  subtitle?: string;
}) {
  const text = code?.trim() ?? "";
  const carried = text ? code39Text(text) : null;
  const bars = carried != null ? code39Bars(carried) : null;
  const square = qr ? qrSquares(qr) : null;

  if (!bars && !square)
    return (
      <p className="text-base text-ink-2">
        A bar label can't carry "{text}". Use letters, numbers and keyboard
        signs in the tag.
      </p>
    );

  const print = () => {
    const page = window.open("", "_blank", "width=480,height=480");
    if (!page) return;
    page.document.write(
      `<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}svg{width:100%;max-width:420px;height:96px}svg.qr{width:160px;height:160px}h1{font-size:20px;margin:12px 0 4px}p{margin:0;font-size:14px}code{font-size:18px;letter-spacing:0.2em}</style></head><body>${qr ? qrSvg(qr) : ""}${carried != null ? `${labelSvg(carried)}<p><code>${escapeHtml(text)}</code></p>` : ""}<h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</body></html>`,
    );
    page.document.close();
    page.focus();
    page.print();
  };

  return (
    <div className="barcode-label">
      {square ? (
        <svg
          className="barcode-label-qr"
          viewBox={`0 0 ${square.size} ${square.size}`}
          shapeRendering="crispEdges"
          role="img"
          aria-label={`QR code for ${title}`}
        >
          <rect width={square.size} height={square.size} fill="#fff" />
          {square.squares.map(([x, y]) => (
            <rect
              key={`${x}:${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill="#000"
            />
          ))}
        </svg>
      ) : null}
      {bars && carried != null ? (
        <>
          <svg
            viewBox={`0 0 ${bars.width + QUIET * 2} ${BAR_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Bar label ${text}`}
          >
            <rect
              width={bars.width + QUIET * 2}
              height={BAR_HEIGHT}
              fill="#fff"
            />
            {bars.bars.map((bar) => (
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
        </>
      ) : null}
      <p className="barcode-label-title">{title}</p>
      {subtitle ? <p className="barcode-label-subtitle">{subtitle}</p> : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={print}>
        Print label
      </button>
    </div>
  );
}
