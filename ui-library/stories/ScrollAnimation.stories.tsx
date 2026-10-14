import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { ScrollFrame } from "../components/motion-scroll-frame";
import { ScrollAnimation } from "../components/scroll-animation";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Scroll Animation",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Scroll Animation (https://ui-layouts.com/components/scroll-animation): wraps any element and fades it in from a direction (blur to sharp) as it scrolls into view. Scroll inside the box.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const photos = [
  "https://images.unsplash.com/photo-1724690416947-3cdc197ffab1?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1718838541476-d04e71caa347?w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1715432362539-6ab2ab480db2?w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1718601980986-0ce75101d52d?w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1685904042960-66242a0ac352?w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1718183120769-ece47f31045b?w=600&auto=format&fit=crop",
];

export const Images: Story = {
  render: () => (
    <ScrollFrame>
      {(container) => (
        <section>
          <div className="h-[300px] grid place-content-center">
            <h1 className="text-4xl font-semibold text-center py-8">
              Scroll Down 👇
            </h1>
          </div>
          <div className="py-2 px-2">
            <div className="columns-3">
              {photos.map((src, index) => (
                <ScrollAnimation
                  key={src}
                  delay={(index % 3) * 0.1}
                  viewport={{
                    once: true,
                    amount: 0.5,
                    margin: "0px 0px 0px 0px",
                    root: container,
                  }}
                >
                  <img src={src} alt="" className="w-full mb-2" />
                </ScrollAnimation>
              ))}
            </div>
          </div>
        </section>
      )}
    </ScrollFrame>
  ),
};

export const Directions: Story = {
  render: () => (
    <ScrollFrame>
      {(container) => (
        <section>
          <div className="h-[300px] grid place-content-center">
            <h1 className="text-4xl font-semibold text-center py-8">
              Scroll Down 👇
            </h1>
          </div>
          <ScrollAnimation
            direction="left"
            viewport={{
              amount: 0.5,
              margin: "0px 0px 0px 0px",
              root: container,
            }}
            className="text-4xl text-left py-24 max-w-md px-4"
          >
            <p>Take a glance over to the left side.</p>
          </ScrollAnimation>
          <ScrollAnimation
            direction="right"
            viewport={{
              amount: 0.5,
              margin: "0px 0px 0px 0px",
              root: container,
            }}
            className="text-4xl text-right py-24 max-w-md ml-auto px-4"
          >
            <p>Now shift your eyes to the right side.</p>
          </ScrollAnimation>
          <ScrollAnimation
            viewport={{
              amount: 0.5,
              margin: "0px 0px 0px 0px",
              root: container,
            }}
            className="text-4xl max-w-md mx-auto text-center py-24 px-4"
          >
            <p>And finally, don’t miss what’s waiting below.</p>
          </ScrollAnimation>
        </section>
      )}
    </ScrollFrame>
  ),
};
