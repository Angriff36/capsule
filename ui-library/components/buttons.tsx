import { type MouseEvent, useRef, useState } from "react";
import { ArrowRight, ChevronsRight } from "../lib/icons-forms";

export const ButtonAnimatedGradient = () => {
  const divRef = useRef<HTMLButtonElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!divRef.current || isFocused) return;

    const div = divRef.current;
    const rect = div.getBoundingClientRect();

    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(1);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <>
      <button
        ref={divRef}
        onMouseMove={handleMouseMove}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative inline-flex w-fit mx-auto h-12 items-center justify-center overflow-hidden rounded-md border-2 dark:border-[#656fe2] border-[#c0c6fc] bg-linear-to-r dark:from-[#070e41] dark:to-[#141d57] from-[#9ba3fdfd] to-[#3d5af1] px-6 font-medium text-white  shadow-2xl transition-colors focus:outline-hidden focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-50"
      >
        <div
          className="pointer-events-none absolute -inset-px opacity-0 transition duration-300"
          style={{
            opacity,
            background: `radial-gradient(100px circle at ${position.x}px ${position.y}px, #656fe288, #00000026)`,
          }}
        />
        <span className="relative z-20">Click Me</span>
      </button>
    </>
  );
};

export const ButtonBackgroundShine = () => {
  return (
    <button className="inline-flex w-fit mx-auto h-12 animate-background-shine items-center justify-center rounded-md  border-2 dark:border-[#656fe2] border-[#c0c6fc] dark:bg-[linear-gradient(110deg,#1e2a78,45%,#3749be,55%,#1e2a78)] bg-[linear-gradient(110deg,#3d5af1,45%,#5471ff,55%,#3d5af1)] bg-size-[200%_100%] dark:hover:border-white px-6 font-medium text-white dark:text-white transition-colors focus:outline-hidden focus:ring-2 dark:focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-50">
      Click Me
    </button>
  );
};

export function ButtonActive() {
  return (
    <>
      <button className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-md  bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f6f7ff] to-[#f5f6ff] dark:border-[rgb(76_100_255)] border-2 border-[#263381]  bg-transparent px-6 font-medium text-foreground transition-all duration-100 hover:[box-shadow:5px_5px_rgb(38_51_129)] translate-x-[3px] hover:translate-x-[0px] translate-y-[3px] hover:translate-y-[0px]   [box-shadow:0px_0px_rgb(38_51_129)] dark:hover:[box-shadow:5px_5px_rgb(76_100_255)]dark:active:[box-shadow:0px_0px_rgb(76_100_255)] active:[box-shadow:0px_0px_rgb(38_51_129)] active:translate-y-[3px] active:translate-x-[3px]">
        Contact me
      </button>
    </>
  );
}

export const ButtonHoverRight = () => {
  return (
    <>
      <button className="group relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#c0c7ff] to-[#4c64ff]  font-medium text-neutral-200 border-2 border-[#656fe2] transition-all duration-300 hover:w-32">
        <div className="inline-flex whitespace-nowrap opacity-0 transition-all duration-200 group-hover:-translate-x-3 group-hover:opacity-100">
          Visit
        </div>
        <div className="absolute right-3.5">
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
          >
            <path
              d="M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            ></path>
          </svg>
        </div>
      </button>
    </>
  );
};

export function ButtonCreativeRight() {
  return (
    <>
      <div className="group relative cursor-pointer p-2 w-32 border bg-white rounded-full overflow-hidden text-black text-center font-semibold">
        <span className="translate-x-1 group-hover:translate-x-12 group-hover:opacity-0 transition-all duration-300 inline-block">
          About
        </span>
        <div className="flex gap-2 text-white z-10 items-center absolute top-0 h-full w-full justify-center translate-x-12 opacity-0 group-hover:-translate-x-1 group-hover:opacity-100 transition-all duration-300">
          <span>About</span>
          <ArrowRight />
        </div>
        <div className="absolute top-[40%] left-[20%] h-2 w-2 group-hover:h-full group-hover:w-full rounded-lg bg-black scale-[1] dark:group-hover:bg-[#e7cb6e] group-hover:bg-[#263381] group-hover:scale-[1.8] transition-all duration-300 group-hover:top-[0%] group-hover:left-[0%] "></div>
      </div>
    </>
  );
}

export function ButtonCreativeTop() {
  return (
    <>
      <div className="group relative cursor-pointer p-2 w-32 border bg-white rounded-full overflow-hidden text-black text-center font-semibold">
        <span className="translate-y-0 group-hover:-translate-y-12 group-hover:opacity-0 transition-all duration-300 inline-block">
          Our Work
        </span>
        <div className="flex gap-2 text-white bg-green-400 z-10 items-center absolute left-0 top-0 h-full w-full justify-center translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 rounded-full group-hover:rounded-none ">
          <span>Our Work</span>
        </div>
      </div>
    </>
  );
}

export const ButtonClickDown = () => {
  return (
    <>
      <button className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-md   bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f6f7ff] to-[#f5f6ff] dark:border-[rgb(76_100_255)] border-2 border-[#263381] bg-transparent px-6 font-medium text-foreground transition-all duration-100 dark:[box-shadow:5px_5px_rgb(76_100_255)] [box-shadow:5px_5px_rgb(38_51_129)] active:translate-x-[3px] active:translate-y-[3px] active:[box-shadow:0px_0px_rgb(38_51_129)] dark:active:[box-shadow:0px_0px_rgb(76_100_255)]">
        Contact me
      </button>
    </>
  );
};

export const ButtonHoverDown = () => {
  return (
    <>
      <button className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-md  bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f6f7ff] to-[#f5f6ff] dark:border-[rgb(76_100_255)] border-2 border-[#263381]  bg-transparent px-6 font-medium text-foreground transition-all duration-100 [box-shadow:5px_5px_rgb(38_51_129)] dark:[box-shadow:5px_5px_rgb(76_100_255)] hover:translate-x-[3px] hover:translate-y-[3px] hover:[box-shadow:0px_0px_rgb(38_51_129)] dark:hover:[box-shadow:0px_0px_rgb(76_100_255)]">
        Contact me
      </button>
    </>
  );
};

export const ButtonHoverMultiple = () => {
  return (
    <>
      <button className="group relative">
        <div
          className="relative z-10 inline-flex h-12 items-center justify-center overflow-hidden rounded-full
        bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f6f7ff] to-[#f5f6ff] dark:border-[rgb(76_100_255)] border-2 border-[#263381] 
         bg-transparent px-6 font-medium text-foreground  transition-all duration-300 group-hover:-translate-x-3 group-hover:-translate-y-3"
        >
          Contact me
        </div>
        <div className="absolute inset-0 z-0 h-full w-full rounded-full transition-all duration-300 group-hover:-translate-x-3 group-hover:-translate-y-3  group-hover:[box-shadow:5px_5px_#394481,10px_10px_#5766be,15px_15px_#8898f3]"></div>
      </button>
    </>
  );
};

export const ButtonHoverUnderLine = () => {
  return (
    <button className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-right after:scale-x-0 after:bg-foreground after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.65_0.05_0.36_1)] hover:after:origin-bottom-left hover:after:scale-x-100">
      Contact me
    </button>
  );
};

export const ButtonHoverTopFlip = () => {
  return (
    <>
      <button className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-md  border-2 dark:border-[#656fe2] border-[#394481]  font-medium">
        <div className="inline-flex h-12 translate-y-0 items-center justify-center  bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f7f8ff] to-[#ffffff]   px-6 text-foreground transition group-hover:-translate-y-[150%]">
          Contact me
        </div>
        <div className="absolute inline-flex h-12 w-full translate-y-full items-center justify-center bg-[#394481] dark:bg-[#656fe2] px-6 text-neutral-50 transition duration-300 group-hover:translate-y-0">
          Contact me
        </div>
      </button>
    </>
  );
};

export const ButtonHoverLeftFlip = () => {
  return (
    <>
      <button className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-md border-2 dark:border-[#656fe2] border-[#394481] font-medium">
        <div className="inline-flex h-12 translate-x-0 items-center justify-center bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f5f6f8] to-[#fafbff]  px-6 dark:text-white text-[#394481] transition group-hover:-translate-x-[150%]">
          Hover me
        </div>
        <div className="absolute inline-flex h-12 w-full translate-x-full items-center justify-center bg-[#394481] dark:bg-[#656fe2] px-6 text-white transition duration-300 group-hover:translate-x-0">
          Hover me
        </div>
      </button>
    </>
  );
};

export const ButtonHoverTopSlowFlip = () => {
  return (
    <>
      <button className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-md border-2 dark:border-[#656fe2] border-[#394481]  font-medium">
        <div className="inline-flex h-12 translate-y-0 items-center justify-center px-6  bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] text-foreground transition duration-500 group-hover:-translate-y-[150%]">
          Hover me
        </div>
        <div className="absolute inline-flex h-12 w-full translate-y-full items-center justify-center text-neutral-50 transition duration-500 group-hover:translate-y-0">
          <span className="absolute h-full w-full translate-y-full skew-y-12 scale-y-0 bg-[#394481] dark:bg-[#656fe2] transition duration-500 group-hover:translate-y-0 group-hover:scale-150"></span>
          <span className="z-10">Hover me</span>
        </div>
      </button>
    </>
  );
};

export const ButtonTextChange = () => {
  return (
    <>
      <button className="group relative h-12 rounded-full border-2 dark:border-[#656fe2] border-[#394481] bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f7f8ff] to-[#ffffff] px-5 text-foreground">
        <span className="relative inline-flex overflow-hidden">
          <div className="translate-y-0 skew-y-0 transition duration-500 group-hover:-translate-y-[110%] group-hover:skew-y-12">
            Contact me
          </div>
          <div className="absolute translate-y-[114%] skew-y-12 transition duration-500 group-hover:translate-y-0 group-hover:skew-y-0">
            Contact me
          </div>
        </span>
      </button>
    </>
  );
};

export const ButtonCrossArrow = () => {
  return (
    <>
      <button className="group relative flex h-12 w-[170px]  items-center justify-between border-2 dark:border-[#656fe2] border-[#394481] rounded-full  bg-linear-to-r dark:from-[#070e41] dark:to-[#263381] from-[#f7f8ff] to-[#ffffff] font-medium text-foreground">
        <span className="pl-4">Contact me</span>
        <div className="relative h-9 w-9 overflow-hidden  dark:bg-white bg-black rounded-full mr-1">
          <div className="absolute top-[0.7em] left-[-0.1em] grid place-content-center transition-all w-full h-full duration-200 group-hover:-translate-y-5 group-hover:translate-x-4 ">
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 dark:fill-black fill-white "
            >
              <path
                d="M3.64645 11.3536C3.45118 11.1583 3.45118 10.8417 3.64645 10.6465L10.2929 4L6 4C5.72386 4 5.5 3.77614 5.5 3.5C5.5 3.22386 5.72386 3 6 3L11.5 3C11.6326 3 11.7598 3.05268 11.8536 3.14645C11.9473 3.24022 12 3.36739 12 3.5L12 9.00001C12 9.27615 11.7761 9.50001 11.5 9.50001C11.2239 9.50001 11 9.27615 11 9.00001V4.70711L4.35355 11.3536C4.15829 11.5488 3.84171 11.5488 3.64645 11.3536Z"
                fillRule="evenodd"
                clipRule="evenodd"
              ></path>
            </svg>
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mb-1 -translate-x-4 dark:fill-black fill-white"
            >
              <path
                d="M3.64645 11.3536C3.45118 11.1583 3.45118 10.8417 3.64645 10.6465L10.2929 4L6 4C5.72386 4 5.5 3.77614 5.5 3.5C5.5 3.22386 5.72386 3 6 3L11.5 3C11.6326 3 11.7598 3.05268 11.8536 3.14645C11.9473 3.24022 12 3.36739 12 3.5L12 9.00001C12 9.27615 11.7761 9.50001 11.5 9.50001C11.2239 9.50001 11 9.27615 11 9.00001V4.70711L4.35355 11.3536C4.15829 11.5488 3.84171 11.5488 3.64645 11.3536Z"
                fillRule="evenodd"
                clipRule="evenodd"
              ></path>
            </svg>
          </div>
        </div>
      </button>
    </>
  );
};

export const ButtonBlackShadow = () => {
  return (
    <>
      <button className="group h-8 select-none rounded-lg dark:bg-black dark:text-white bg-white dark:bg-linear-to-b dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-600 px-3 text-sm leading-8 text-zinc-950 shadow-[0_-1px_0_0px_#d4d4d8_inset,0_0_0_1px_#f4f4f5_inset,0_0.5px_0_1.5px_#fff_inset] dark:shadow-[0_-1px_0_1px_rgba(0,0,0,0.8)_inset,0_0_0_1px_rgb(9_9_11)_inset,0_0.5px_0_1.5px_#71717a_inset] hover:bg-zinc-50 hover:via-zinc-900 hover:to-zinc-800 active:shadow-[-1px_0px_1px_0px_#e4e4e7_inset,1px_0px_1px_0px_#e4e4e7_inset,0px_0.125rem_1px_0px_#d4d4d8_inset] dark:hover:bg-linear-to-b dark:hover:from-zinc-900 dark:hover:via-zinc-900 dark:hover:to-zinc-700 dark:active:shadow-[0_3px_0_0_rgba(0,0,0)_inset]">
        <span className="block group-active:transform-[translate3d(0,1px,0)]">
          Click me
        </span>
      </button>
    </>
  );
};

export const ButtonHoverOutLine = () => {
  return (
    <>
      <a
        className="flex  gap-2 cursor-pointer px-4 py-3 dark:hover:bg-black bg-black hover:bg-white hover:text-black text-white border-black dark:hover:text-white transition-all border-2 dark:border-white dark:bg-white dark:text-black rounded-full font-semibold"
        href="#"
      >
        Know More
        <ChevronsRight />
      </a>
    </>
  );
};

export const ButtonHover14 = () => {
  return (
    <>
      <button className="group cursor-pointer slide-anime px-5 py-3 rounded-full w-[180px] shadow bg-card text-primary flex justify-between items-center font-semibold ">
        Schedule Call{" "}
        <div className="group-hover:translate-x-2 transition-all">
          <ArrowRight />
        </div>
      </button>
    </>
  );
};

export const ButtonRotatingGradient = () => {
  return (
    <button className="relative inline-flex h-12 overflow-hidden rounded-full p-[2px] focus:outline-hidden focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-50">
      <span className="absolute  inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#a2aeff_0%,#3749be_50%,#a2aeff_100%)] dark:bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
      <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full dark:bg-[#070e41] bg-[#ffffff] px-8 py-1 text-sm font-medium text-foreground backdrop-blur-3xl">
        Click Me
      </span>
    </button>
  );
};
