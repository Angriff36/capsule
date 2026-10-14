import {
  type MotionValue,
  motion,
  useScroll,
  useTransform,
} from "motion/react";
import { type RefObject, useRef } from "react";

// Three CSS position:sticky layouts from ui-layouts. The originals wrap the page in
// Lenis smooth scrolling; that wrapper is left out (the sticky effect does not need it).

export function StickyElement() {
  return (
    <main className="bg-black">
      <div className="wrapper">
        <section className="text-white  h-screen  w-full bg-slate-950  grid place-content-center sticky top-0">
          <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-size-[54px_54px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

          <h1 className="2xl:text-7xl text-6xl px-8 font-semibold text-center tracking-tight leading-[120%]">
            I Know What Exactly you're <br /> Looking For! Scroll Please 👇
          </h1>
        </section>

        <section className="bg-neutral-300 text-black grid place-content-center h-screen sticky top-0 rounded-tr-2xl rounded-tl-2xl overflow-hidden">
          <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-size-[54px_54px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          <h1 className="2xl:text-7xl text-4xl px-8 font-semibold text-center tracking-tight leading-[120%]">
            If you don't like this Smooth Scroll then I'm sorry, <br /> create
            your own and make it open source 💼
          </h1>
        </section>
        <section className="text-white  h-screen  w-full bg-slate-950  grid place-content-center sticky top-0">
          <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-size-[54px_54px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          <h1 className="2xl:text-7xl text-5xl px-8 font-semibold text-center tracking-tight leading-[120%]">
            Don't Forget To Share <br /> This Sticky CSS Tricks.😎
          </h1>
        </section>
      </div>

      <section className="text-white   w-full bg-slate-950  ">
        <div className="grid grid-cols-2">
          <div className="sticky top-0 h-screen flex items-center justify-center">
            <h1 className="2xl:text-7xl text-5xl px-8 font-semibold text-center tracking-tight leading-[120%]">
              Thanks To Scroll.
              <br /> Now Scroll Up Again☝️🏿
            </h1>
          </div>
          <div className="grid gap-2">
            <figure className="grid place-content-center -skew-x-12">
              <img
                src="https://images.unsplash.com/photo-1718838541476-d04e71caa347?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-80 h-96  align-bottom object-cover "
              />
            </figure>
            <figure className="grid place-content-center skew-x-12">
              <img
                src="https://images.unsplash.com/photo-1715432362539-6ab2ab480db2?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-80 h-96  align-bottom object-cover "
              />
            </figure>
            <figure className="grid place-content-center -skew-x-12">
              <img
                src="https://images.unsplash.com/photo-1718601980986-0ce75101d52d?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-80 h-96  align-bottom object-cover "
              />
            </figure>
            <figure className="grid place-content-center skew-x-12">
              <img
                src="https://images.unsplash.com/photo-1685904042960-66242a0ac352?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-80 h-96  align-bottom object-cover "
              />
            </figure>
          </div>
        </div>
      </section>
      <section className="text-white   w-full bg-slate-950  ">
        <div className="grid grid-cols-2 px-8">
          <div className="grid gap-2">
            <figure className="sticky top-0 h-screen grid place-content-center">
              <img
                src="https://images.unsplash.com/photo-1718183120769-ece47f31045b?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-96 h-96  align-bottom object-cover rounded-md"
              />
            </figure>
            <figure className="sticky top-0 h-screen grid place-content-center">
              <img
                src="https://images.unsplash.com/photo-1715432362539-6ab2ab480db2?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300  w-96 h-96   align-bottom object-cover rounded-md"
              />
            </figure>
            <figure className="sticky top-0 h-screen grid place-content-center">
              <img
                src="https://images.unsplash.com/photo-1685904042960-66242a0ac352?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-96 h-96   align-bottom object-cover rounded-md"
              />
            </figure>
            <figure className="sticky top-0 h-screen grid place-content-center">
              <img
                src="https://images.unsplash.com/photo-1718838541476-d04e71caa347?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300  w-96 h-96   align-bottom object-cover rounded-md"
              />
            </figure>
          </div>
          <div className="sticky top-0 h-screen grid place-content-center">
            <h1 className="text-4xl px-8 font-medium text-right tracking-tight leading-[120%]">
              Copied & Paste Every Component you want and make an creative
              website 😎
            </h1>
          </div>
        </div>
      </section>
      <footer className="group bg-slate-950 ">
        <h1 className="text-[16vw] group-hover:translate-y-4 translate-y-20 leading-[100%] uppercase font-semibold text-center bg-linear-to-r from-neutral-400 to-neutral-800 bg-clip-text text-transparent transition-all ease-linear">
          ui-layout
        </h1>
        <section className="bg-black h-40 relative z-10 grid place-content-center text-2xl rounded-tr-full rounded-tl-full">
          Thanks for Scrolling
        </section>
      </footer>
    </main>
  );
}

export function StickyGallery() {
  return (
    <main className="bg-black">
      <div className="wrapper">
        <section className="text-white  h-screen  w-full bg-slate-950  grid place-content-center sticky top-0">
          <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-size-[54px_54px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

          <h1 className="2xl:text-7xl text-5xl px-8 font-semibold text-center tracking-tight leading-[120%]">
            Create Gallery In a Better Way
            <br />
            Using CSS sticky properties <br />
            Scroll down! 👇
          </h1>
        </section>
      </div>

      <section className="text-white   w-full bg-slate-950  ">
        <div className="grid grid-cols-12 gap-2">
          {/* left part */}
          <div className="grid gap-2 col-span-4">
            <figure className=" w-full">
              <img
                src="https://images.unsplash.com/photo-1718838541476-d04e71caa347?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className=" w-full">
              <img
                src="https://images.unsplash.com/photo-1715432362539-6ab2ab480db2?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className=" w-full">
              <img
                src="https://images.unsplash.com/photo-1718601980986-0ce75101d52d?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full">
              <img
                src="https://images.unsplash.com/photo-1685904042960-66242a0ac352?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full">
              <img
                src="https://images.unsplash.com/photo-1719411182379-ffd97c1f7ebf?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
          </div>
          {/* sticky part */}
          <div className="sticky top-0 h-screen w-full col-span-4 gap-2  grid grid-rows-3">
            <figure className="w-full h-full ">
              <img
                src="https://images.unsplash.com/photo-1718969604981-de826f44ce15?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 h-full w-full  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full h-full ">
              <img
                src="https://images.unsplash.com/photo-1476180814856-a36609db0493?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 h-full w-full align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full h-full ">
              <img
                src="https://images.unsplash.com/photo-1595407660626-db35dcd16609?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 h-full w-full  align-bottom object-cover rounded-md "
              />
            </figure>
          </div>
          {/* right part */}
          <div className="grid gap-2 col-span-4">
            <figure className="w-full">
              <img
                src="https://images.unsplash.com/photo-1719547907790-f661a88302c2?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full">
              <img
                src="https://images.unsplash.com/photo-1599054799131-4b09c73a63cf?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full">
              <img
                src="https://images.unsplash.com/photo-1719963532023-01b573d1d584?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full">
              <img
                src="https://images.unsplash.com/photo-1714328101501-3594de6cb80f?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
            <figure className="w-full">
              <img
                src="https://images.unsplash.com/photo-1719554873571-0fd6bf322bb1?w=500&auto=format&fit=crop"
                alt=""
                className="transition-all duration-300 w-full h-96  align-bottom object-cover rounded-md "
              />
            </figure>
          </div>
        </div>
      </section>

      <footer className="group bg-slate-950 ">
        <h1 className="text-[16vw]  translate-y-20 leading-[100%] uppercase font-semibold text-center bg-linear-to-r from-neutral-400 to-neutral-800 bg-clip-text text-transparent transition-all ease-linear">
          ui-layout
        </h1>
        <div className="bg-black h-40 relative z-10 grid place-content-center text-2xl rounded-tr-full rounded-tl-full"></div>
      </footer>
    </main>
  );
}

export function StickyHeroSection({
  container: scrollBox,
}: {
  container?: RefObject<HTMLElement | null>;
}) {
  const container = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: container,
    ...(scrollBox ? { container: scrollBox } : {}),
    offset: ["start start", "end end"],
  });
  return (
    <>
      <main ref={container} className="relative h-[200vh] bg-black  ">
        <Section1 scrollYProgress={scrollYProgress} />
        <Section2 scrollYProgress={scrollYProgress} />
        <footer className="group bg-[#06060e] ">
          <h1 className="text-[16vw] translate-y-20 leading-[100%] uppercase font-semibold text-center bg-linear-to-r from-neutral-400 to-neutral-800 bg-clip-text text-transparent transition-all ease-linear">
            ui-layout
          </h1>
          <div className="bg-black text-white h-40 relative z-10 grid place-content-center text-2xl rounded-tr-full rounded-tl-full"></div>
        </footer>
      </main>
    </>
  );
}
const Section1 = ({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>;
}) => {
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.8]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0, -5]);
  return (
    <motion.section
      style={{ scale, rotate }}
      className="sticky  font-semibold top-0 h-screen bg-linear-to-t to-[#dadada] from-[#ebebeb] flex flex-col items-center justify-center text-black"
    >
      <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-size-[54px_54px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <h1 className="2xl:text-7xl text-6xl px-8 font-semibold text-center tracking-tight leading-[120%]">
        An Hero section Animation <br /> Scroll Please 👇
      </h1>
    </motion.section>
  );
};
const Section2 = ({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>;
}) => {
  const scale = useTransform(scrollYProgress, [0, 1], [0.8, 1]);
  const rotate = useTransform(scrollYProgress, [0, 1], [5, 0]);
  return (
    <motion.section
      style={{ scale, rotate }}
      className="relative h-screen bg-linear-to-t to-[#1a1919] from-[#06060e] text-white "
    >
      <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-size-[54px_54px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      <article className="container mx-auto relative z-10 ">
        <h1 className="text-6xl leading-[100%] py-10 font-semibold  tracking-tight ">
          Images That doesn't Make any sense <br /> but still in this section
        </h1>
        <div className="grid grid-cols-4 gap-4">
          <img
            src="https://images.unsplash.com/photo-1717893777838-4e222311630b?w=1200&auto=format&fit=crop"
            alt="img"
            className=" object-cover w-full rounded-md h-full"
          />
          <img
            src="https://images.unsplash.com/photo-1717618389115-88db6d7d8f77?w=500&auto=format&fit=crop"
            alt="img"
            className=" object-cover w-full rounded-md"
          />
          <img
            src="https://images.unsplash.com/photo-1717588604557-55b2888f59a6?w=500&auto=format&fit=crop"
            alt="img"
            className=" object-cover w-full rounded-md h-full"
          />
          <img
            src="https://images.unsplash.com/photo-1713417338603-1b6b72fcade2?w=500&auto=format&fit=crop"
            alt="img"
            className=" object-cover w-full rounded-md h-full"
          />
        </div>
      </article>
    </motion.section>
  );
};
