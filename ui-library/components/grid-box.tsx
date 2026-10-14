const media = (file: string) =>
  `https://ui-layouts.com/_next/static/media/${file}.svg`;

const preview = {
  dragitems: media("drag-items.2a19030e"),
  galleryNew: media("gallerynew.35a15415"),
  carousel: media("carousel.c8dde731"),
  clippath: media("clip-path.5c6b94c3"),
  sparkles: media("sparkles.8f403061"),
  faqs: media("faqs.e4e7dc72"),
  grid: media("grid.c2376ade"),
  image_masking: media("image_masking.065f7a4d"),
};

export default function BoxGrid() {
  return (
    <>
      <div className="grid grid-rows-10  grid-cols-12 grid-flow-col gap-2  pt-10">
        <div className="row-start-1 col-span-2 row-end-6  dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.dragitems} className=" object-cover" alt="" />
        </div>
        <div className="row-start-6 row-end-11  col-span-2 dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.galleryNew} className=" object-cover" alt="" />
        </div>
        <div className="row-start-3 row-end-9  col-span-2 dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.carousel} className=" object-cover" alt="" />
        </div>
        <div className="row-start-1 col-span-2 row-end-6  dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.clippath} className=" object-cover" alt="" />
        </div>
        <div className="row-start-6 row-end-11  col-span-2 dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.sparkles} className=" object-cover" alt="" />
        </div>
        <div className="row-start-3 row-end-9  col-span-2 dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.carousel} className=" object-cover" alt="" />
        </div>
        <div className="row-start-1 col-span-2 row-end-6 dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.faqs} className=" object-cover" alt="" />
        </div>
        <div className="row-start-6 row-end-11  col-span-2 dark:bg-neutral-800 bg-neutral-100 grid place-content-center  h-full lg:rounded-xl rounded-md">
          <img src={preview.grid} className=" object-cover" alt="" />
        </div>
        <div className="row-start-3 row-end-9  col-span-2 dark:bg-neutral-800 bg-neutral-100 grid place-content-center h-full lg:rounded-xl rounded-md">
          <img src={preview.image_masking} className=" object-cover" alt="" />
        </div>
      </div>
    </>
  );
}
