import React from "react";

// The docs use three local team portraits (/adrian.png etc.); they are not in
// this repo, so the same card layout is shown with the docs' unsplash photos.
const items = [
  {
    id: "1",
    url: "https://images.unsplash.com/photo-1709949908058-a08659bfa922?q=80&w=960&auto=format",
    title: "Adrian Paul",
    description: "COO & Co-Founder",
  },
  {
    id: "2",
    url: "https://images.unsplash.com/photo-1548192746-dd526f154ed9?q=80&w=960&auto=format",
    title: "Flualy Cual",
    description: "Founder & CEO",
  },
  {
    id: "3",
    url: "https://images.unsplash.com/photo-1693581176773-a5f2362209e6?q=80&w=960&auto=format",
    title: "Naymur Rahman",
    description: "CTO & Co-Founder",
  },
];

function TailwindImageAccordion() {
  return (
    <>
      <div className="group flex max-md:flex-col justify-center gap-2 w-[80%] mx-auto mb-10 mt-3">
        {items.map((item) => {
          return (
            <article
              key={item.id}
              className="group/article relative w-full rounded-xl overflow-hidden md:not-[&:hover]:group-hover:w-[20%] md:[&:not(:focus-within):not(:hover)]:group-focus-within:w-[20%] transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.15)] before:absolute before:inset-x-0 before:bottom-0 before:h-1/3 before:bg-linear-to-t before:from-black/50 before:transition-opacity md:before:opacity-0 md:hover:before:opacity-100 focus-within:before:opacity-100 after:opacity-0 md:not-[&:hover]:group-hover:after:opacity-100 md:[&:not(:focus-within):not(:hover)]:group-focus-within:after:opacity-100 after:absolute after:inset-0 after:bg-white/30 after:backdrop-blur-sm after:rounded-lg after:transition-all focus-within:ring-3 focus-within:ring-indigo-300"
            >
              <a
                className="absolute inset-0 text-white z-10  p-3 flex flex-col justify-end"
                href="#"
                onClick={(e) => e.preventDefault()}
              >
                <h1 className=" text-xl font-medium   md:whitespace-nowrap md:truncate md:opacity-0 group-hover/article:opacity-100 group-focus-within/article:opacity-100 md:translate-y-2 group-hover/article:translate-y-0 group-focus-within/article:translate-y-0 transition duration-200 ease-[cubic-bezier(.5,.85,.25,1.8)] group-hover/article:delay-300 group-focus-within/article:delay-300">
                  {item.title}
                </h1>
                <span className=" text-3xl font-medium  md:whitespace-nowrap md:truncate md:opacity-0 group-hover/article:opacity-100 group-focus-within/article:opacity-100 md:translate-y-2 group-hover/article:translate-y-0 group-focus-within/article:translate-y-0 transition duration-200 ease-[cubic-bezier(.5,.85,.25,1.8)] group-hover/article:delay-500 group-focus-within/article:delay-500">
                  {item.description}
                </span>
              </a>
              <img
                className="object-cover h-72 md:h-[420px]  w-full"
                src={item.url}
                width="960"
                height="480"
                alt={item.title}
              />
            </article>
          );
        })}
      </div>
    </>
  );
}

export default TailwindImageAccordion;
