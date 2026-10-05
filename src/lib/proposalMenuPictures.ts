// AC-654: dish pictures for the proposal file. Each picture is fetched and
// shrunk to at most 640 px on its long side before it goes into the file, so a
// phone photo does not make the emailed file many megabytes. A picture that
// cannot load is left out; the file still prints with the dish name.

const LONG_SIDE = 640;

async function pictureDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(
      1,
      LONG_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const draw = canvas.getContext("2d");
    if (!draw) return null;
    draw.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

type WithPictures = {
  menuPictures?: Array<{
    imageUrl?: string | null;
    imageDataUrl?: string | null;
  }>;
};

/** The proposal with each dish picture ready to draw (imageDataUrl). */
export async function loadMenuPictures<T extends WithPictures>(
  proposal: T,
): Promise<T> {
  const pictures = proposal.menuPictures ?? [];
  if (!pictures.some((picture) => picture.imageUrl && !picture.imageDataUrl))
    return proposal;
  const loaded = await Promise.all(
    pictures.map(async (picture) =>
      picture.imageDataUrl || !picture.imageUrl
        ? picture
        : { ...picture, imageDataUrl: await pictureDataUrl(picture.imageUrl) },
    ),
  );
  return { ...proposal, menuPictures: loaded };
}
