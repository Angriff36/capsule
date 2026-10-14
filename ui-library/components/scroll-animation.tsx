import { cn } from "../lib/utils";
import { type HTMLMotionProps, type Variant, motion } from "motion/react";
import type { ReactNode, RefObject } from "react";

type Direction = "up" | "down" | "left" | "right";
type AsTag =
  | "div"
  | "span"
  | "h1"
  | "h2"
  | "h3"
  | "a"
  | "p"
  | "section"
  | "figure"
  | "button"
  | "article";

type ScrollVariants = {
  hidden: Variant;
  visible: Variant;
};

const generateVariants = (direction: Direction): ScrollVariants => {
  const horizontal = direction === "left" || direction === "right";
  const value = direction === "right" || direction === "down" ? 20 : -20;

  return {
    hidden: {
      filter: "blur(10px)",
      opacity: 0,
      ...(horizontal ? { x: value } : { y: value }),
    },
    visible: {
      filter: "blur(0px)",
      opacity: 1,
      ...(horizontal ? { x: 0 } : { y: 0 }),
      transition: {
        duration: 0.7,
        ease: "easeOut",
      },
    },
  };
};

interface ScrollViewport {
  amount?: number;
  margin?: string;
  once?: boolean;
  /** Scroll box that decides what counts as "in view" (defaults to the page). */
  root?: RefObject<Element | null>;
}

const defaultViewport: ScrollViewport = {
  once: true,
  amount: 0.3,
  margin: "0px 0px -200px 0px",
};

interface ScrollElementProps extends Omit<
  HTMLMotionProps<"div">,
  "variants" | "viewport" | "children"
> {
  children: ReactNode;
  className?: string;
  variants?: Partial<ScrollVariants>;
  viewport?: ScrollViewport;
  delay?: number;
  direction?: Direction;
  as?: AsTag;
}

export function ScrollAnimation({
  children,
  className,
  variants,
  viewport = defaultViewport,
  delay = 0,
  direction = "down",
  as: Component = "div",
  ...props
}: ScrollElementProps) {
  const generated = generateVariants(direction);
  const baseVariants: ScrollVariants = {
    hidden: variants?.hidden ?? generated.hidden,
    visible: variants?.visible ?? generated.visible,
  };
  const visible =
    typeof baseVariants.visible === "object" ? baseVariants.visible : {};
  const modifiedVariants: ScrollVariants = {
    hidden: baseVariants.hidden,
    visible: {
      ...visible,
      transition: {
        ...visible.transition,
        delay,
      },
    },
  };

  const MotionComponent = motion[Component] as typeof motion.div;

  return (
    <MotionComponent
      whileInView="visible"
      initial="hidden"
      variants={modifiedVariants}
      viewport={viewport}
      className={cn(className)}
      {...props}
    >
      {children}
    </MotionComponent>
  );
}
