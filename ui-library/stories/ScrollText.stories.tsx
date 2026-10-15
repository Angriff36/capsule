import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { ScrollFrame } from "../components/motion-scroll-frame";
import TextAnimation from "../components/scroll-text";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Scroll Text",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Scroll Text (https://ui-layouts.com/components/scroll-text): text that animates in word by word, letter by letter, or as a line when it scrolls into view. Scroll inside the box.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <ScrollFrame height={560}>
      {(container) => {
        const viewport = {
          amount: 0.3,
          margin: "0px 0px 0px 0px",
          root: container,
        };
        return (
          <div>
            <div className="h-[300px] grid place-content-center">
              <h1 className="text-4xl font-semibold">Scroll Down👇</h1>
            </div>

            <div className="h-[400px] flex flex-col justify-center items-center text-center">
              <TextAnimation
                text="Creative ideas start here."
                viewport={viewport}
                variants={{
                  hidden: { filter: "blur(10px)", opacity: 0, y: 20 },
                  visible: {
                    filter: "blur(0px)",
                    opacity: 1,
                    y: 0,
                    transition: { ease: "linear" },
                  },
                }}
                classname="text-5xl max-w-md mx-auto font-medium capitalize"
              />
            </div>

            <div className="h-[400px] flex items-center text-left px-4">
              <TextAnimation
                as="p"
                letterAnime={true}
                viewport={viewport}
                text="Let's team up and turn ideas into reality ✨"
                classname="text-5xl max-w-md lowercase"
                variants={{
                  hidden: { filter: "blur(4px)", opacity: 0, y: 20 },
                  visible: {
                    filter: "blur(0px)",
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.2,
                    },
                  },
                }}
              />
            </div>

            <div className="h-[400px] flex justify-center items-center text-right px-4">
              <TextAnimation
                text="Turning concepts into reality"
                direction="right"
                viewport={viewport}
                classname="text-5xl max-w-md ml-auto capitalize"
              />
            </div>

            <div className="h-[400px] flex justify-center items-center text-center px-4">
              <TextAnimation
                text="Dream big, work hard & achieve greatness "
                direction="down"
                lineAnime={true}
                viewport={viewport}
                classname="text-5xl max-w-md mx-auto capitalize"
              />
            </div>
          </div>
        );
      }}
    </ScrollFrame>
  ),
};
