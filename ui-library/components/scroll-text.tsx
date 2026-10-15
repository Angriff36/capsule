import { cn } from "../lib/utils";
import { type Variant, type Variants, motion } from "motion/react";
import type { ElementType, RefObject } from "react";

type Direction = "up" | "down" | "left" | "right";

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

type TextVariants = {
  hidden: Variant;
  visible: Variant;
};

const generateVariants = (direction: Direction): TextVariants => {
  const horizontal = direction === "left" || direction === "right";
  const value = direction === "right" || direction === "down" ? 100 : -100;

  return {
    hidden: {
      filter: "blur(10px)",
      opacity: 0,
      ...(horizontal ? { translateX: value } : { translateY: value }),
    },
    visible: {
      filter: "blur(0px)",
      opacity: 1,
      ...(horizontal ? { translateX: 0 } : { translateY: 0 }),
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };
};

interface TextViewport {
  amount?: number;
  margin?: string;
  once?: boolean;
  /** Scroll box that decides what counts as "in view" (defaults to the page). */
  root?: RefObject<Element | null>;
}

const defaultViewport: TextViewport = {
  amount: 0.3,
  margin: "0px 0px 0px 0px",
};

const TextAnimation = ({
  as = "h1",
  text,
  classname = "",
  viewport = defaultViewport,
  variants,
  direction = "down",
  letterAnime = false,
  lineAnime = false,
}: {
  text: string;
  classname?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  viewport?: TextViewport;
  variants?: Partial<TextVariants>;
  direction?: Direction;
  letterAnime?: boolean;
  lineAnime?: boolean;
}) => {
  const generated = generateVariants(direction);
  const modifiedVariants: TextVariants = {
    hidden: variants?.hidden ?? generated.hidden,
    visible: variants?.visible ?? generated.visible,
  };

  const MotionComponent = motion[as] as ElementType;

  return (
    <MotionComponent
      whileInView="visible"
      initial="hidden"
      variants={containerVariants}
      viewport={viewport}
      className={cn(
        `inline-block dark:text-white text-black uppercase`,
        classname,
      )}
    >
      {lineAnime ? (
        <motion.span className={`inline-block`} variants={modifiedVariants}>
          {text}
        </motion.span>
      ) : (
        <>
          {text.split(" ").map((word: string, index: number) => (
            <motion.span
              key={`${word}-${index}`}
              className={`inline-block`}
              variants={letterAnime === false ? modifiedVariants : {}}
            >
              {letterAnime ? (
                <>
                  {word.split("").map((letter: string, letterIndex: number) => (
                    <motion.span
                      key={letterIndex}
                      className={`inline-block`}
                      variants={modifiedVariants}
                    >
                      {letter}
                    </motion.span>
                  ))}
                  &nbsp;
                </>
              ) : (
                <>{word}&nbsp;</>
              )}
            </motion.span>
          ))}
        </>
      )}
    </MotionComponent>
  );
};

export default TextAnimation;
