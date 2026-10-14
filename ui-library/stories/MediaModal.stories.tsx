import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { MediaModal, transition } from "../components/media-modal";
import { X } from "../lib/icons-overlays";

const meta: Meta = {
  title: "UI Layouts Library/Overlays/Media Modal",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Media Modal (https://ui-layouts.com/components/media-modal): an image or video card that expands into a modal with a shared-layout animation.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const IMAGE =
  "https://images.unsplash.com/photo-1726824766931-4bd8b59af37c?q=80&w=1000&auto=format&fit=crop";
const VIDEO =
  "https://videos.pexels.com/video-files/7710243/7710243-uhd_2560_1440_30fps.mp4";

interface MediaItem {
  id: number;
  imgSrc?: string;
  videoSrc?: string;
}

const items: MediaItem[] = [
  { id: 1, imgSrc: IMAGE },
  { id: 2, videoSrc: VIDEO },
];

/** The docs page demo: a draggable row of media cards sharing one modal. */
function CarouselDemo() {
  const [index, setIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const carousel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("overflow-hidden");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    const element = carousel.current;
    if (element) setCarouselWidth(element.scrollWidth - element.offsetWidth);
  }, []);

  const currentItem = items[index];

  return (
    <div className="relative h-full">
      <MotionConfig transition={transition}>
        <motion.div
          ref={carousel}
          drag="x"
          dragElastic={0.2}
          dragConstraints={{ right: 0, left: -carouselWidth }}
          dragTransition={{ bounceDamping: 30 }}
          transition={{ duration: 8, ease: "easeInOut" }}
          className="flex w-full  gap-4   py-10"
        >
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              className="w-full flex relative  flex-col overflow-hidden border    bg-muted hover:bg-muted/80"
              layoutId={`dialog-${item.id}`}
              style={{ borderRadius: "12px" }}
              tabIndex={i}
              onClick={() => {
                setIndex(i);
                setIsOpen(true);
              }}
            >
              {item.imgSrc && (
                <motion.div
                  layoutId={`dialog-img-${item.id}`}
                  className="w-full h-full"
                >
                  <img
                    src={item.imgSrc}
                    alt=""
                    className=" w-full object-cover"
                  />
                </motion.div>
              )}
              {item.videoSrc && (
                <motion.div
                  layoutId={`dialog-video-${item.id}`}
                  className="w-full h-full"
                >
                  <video
                    autoPlay
                    muted
                    loop
                    className="h-full w-full object-cover  rounded-xs"
                  >
                    <source src={item.videoSrc} type="video/mp4" />
                  </video>
                </motion.div>
              )}
            </motion.div>
          ))}
        </motion.div>
        <AnimatePresence initial={false} mode="sync">
          {isOpen && (
            <>
              <motion.div
                key={`backdrop-${currentItem.id}`}
                className="fixed inset-0 h-full w-full dark:bg-black/25 bg-white/95 backdrop-blur-xs "
                variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
                initial="closed"
                animate="open"
                exit="closed"
                onClick={() => setIsOpen(false)}
              />
              <motion.div
                key="dialog"
                className="pointer-events-none fixed inset-0 flex items-center justify-center z-50"
              >
                <motion.div
                  className="pointer-events-auto relative flex flex-col overflow-hidden   bg-muted border w-[80%] h-[90%] "
                  layoutId={`dialog-${currentItem.id}`}
                  tabIndex={-1}
                  style={{ borderRadius: "24px" }}
                >
                  {currentItem.imgSrc && (
                    <motion.div
                      layoutId={`dialog-img-${currentItem.id}`}
                      className="w-full h-full"
                    >
                      <img
                        src={currentItem.imgSrc}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </motion.div>
                  )}
                  {currentItem.videoSrc && (
                    <motion.div
                      layoutId={`dialog-video-${currentItem.id}`}
                      className="w-full h-full"
                    >
                      <video
                        autoPlay
                        muted
                        loop
                        controls
                        className="h-full w-full object-cover  rounded-xs"
                      >
                        <source src={currentItem.videoSrc} type="video/mp4" />
                      </video>
                    </motion.div>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="absolute right-6 top-6 p-3 text-muted-foreground cursor-pointer bg-muted hover:bg-muted/80 rounded-full"
                    type="button"
                    aria-label="Close dialog"
                  >
                    <X size={24} />
                  </button>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}

export const Image: Story = {
  render: () => (
    <div className="mx-auto h-64 w-96">
      <MediaModal imgSrc={IMAGE} />
    </div>
  ),
};
export const Video: Story = {
  render: () => (
    <div className="mx-auto h-64 w-96">
      <MediaModal videoSrc={VIDEO} />
    </div>
  ),
};
export const DraggableRow: Story = { render: () => <CarouselDemo /> };
