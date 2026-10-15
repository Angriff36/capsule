import {
  type MotionValue,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { type RefObject, useRef } from "react";
import { LenisRoot } from "./lenis-scroll-frame";

const slides = [
  {
    word: "PASSION",
    bg: "bg-red-400",
    src: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=600&fit=crop",
  },
  {
    word: "WORK",
    bg: "bg-blue-400",
    src: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&h=600&fit=crop",
  },
  {
    word: "MOTIVATION",
    bg: "bg-orange-400",
    src: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&h=600&fit=crop",
  },
  {
    word: "INSPIRATION",
    bg: "bg-yellow-400",
    src: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600&h=600&fit=crop",
  },
  {
    word: "BELIVE",
    bg: "bg-green-400",
    src: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&h=600&fit=crop",
  },
];

interface SlideProps {
  index: number;
  word: string;
  bg: string;
  src: string;
  section: RefObject<HTMLElement | null>;
  container?: RefObject<HTMLElement | null>;
}

/** One slide: its heading slides across while this slide's share of the scroll plays. */
function Slide({ index, word, bg, src, section, container }: SlideProps) {
  const segmentLength = 1 / slides.length;
  const { scrollYProgress } = useScroll({
    target: section,
    ...(container ? { container } : {}),
    offset: [
      [index * segmentLength, 1],
      [(index + 1) * segmentLength, 0],
    ],
  });
  const x = useTransform(scrollYProgress, [0, 1], [800, -800]);

  return (
    <li
      className={`h-screen w-screen ${bg} flex flex-col justify-center overflow-hidden  items-center`}
    >
      <motion.h2
        style={{ x }}
        className="text-[20vw] font-semibold relative bottom-5 inline-block text-black"
      >
        {word}
      </motion.h2>
      <img
        src={src}
        className="2xl:w-[550px] w-[380px] absolute bottom-0"
        width={500}
        height={500}
        alt="image"
      />
    </li>
  );
}

function Track({
  progress,
  section,
  container,
}: {
  progress: MotionValue<number>;
  section: RefObject<HTMLElement | null>;
  container?: RefObject<HTMLElement | null>;
}) {
  const translate = useTransform(
    progress,
    [0, 1],
    ["0vw", `-${slides.length - 1}00vw`],
  );
  const x = useSpring(translate, { stiffness: 200, damping: 30 });
  return (
    <motion.ul style={{ x }} className="flex sticky top-0">
      {slides.map((slide, index) => (
        <Slide
          key={slide.word}
          index={index}
          section={section}
          container={container}
          {...slide}
        />
      ))}
    </motion.ul>
  );
}

/** Vertical scrolling drives a horizontal strip of full-screen slides.
 *  `container` is the scroll box (defaults to the page). */
export default function HorizontalScroll({
  container,
}: {
  container?: RefObject<HTMLElement | null>;
}) {
  const section = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: section,
    ...(container ? { container } : {}),
  });

  return (
    <LenisRoot bounded={container !== undefined}>
      <main>
        <article>
          <header className="text-white relative  w-full bg-slate-950  grid place-content-center  h-[80vh]">
            <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-size-[14px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

            <h1 className="text-6xl font-bold text-center tracking-tight">
              I know You Love to Scroll <br />
              So Scroll
            </h1>
          </header>
          <section ref={section} className="h-[500vh] relative">
            <Track
              progress={scrollYProgress}
              section={section}
              container={container}
            />
          </section>
          <footer className="bg-red-600 font-medium text-white grid place-content-center h-[80vh]">
            <p>
              Inspired By{" "}
              <a target="_blank" href="https://twitter.com/mattgperry">
                Matt Perry
              </a>
            </p>
          </footer>
        </article>
      </main>
    </LenisRoot>
  );
}
