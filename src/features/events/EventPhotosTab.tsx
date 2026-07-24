import {
  EVENT_PHOTO_CATEGORIES,
  RecordPhotoCapture,
} from "../attachments/RecordPhotoCapture";
import { AttachmentsSection } from "../attachments/AttachmentsSection";
import { EventTabIntro } from "./EventTabIntro";

type Props = {
  readonly eventId: string;
};

export function EventPhotosTab({ eventId }: Props) {
  return (
    <section className="space-y-4" data-testid="event-photos-tab">
      <EventTabIntro
        title="Event photo gallery"
        description="Upload setup, food, service, and venue photos. Empty gallery starts with the upload action below."
      />
      <RecordPhotoCapture
        parentType="eventRecord"
        parentId={eventId}
        title="Gallery"
        description="Capture photos during and after the event. Mark selections for the post-event feedback survey when needed."
        evidenceCategories={EVENT_PHOTO_CATEGORIES}
        surveySelection
        downloadAll
      />
      <AttachmentsSection parentType="eventRecord" parentId={eventId} />
    </section>
  );
}
