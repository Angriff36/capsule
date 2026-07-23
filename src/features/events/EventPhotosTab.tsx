import {
  EVENT_PHOTO_CATEGORIES,
  RecordPhotoCapture,
} from "../attachments/RecordPhotoCapture";
import { AttachmentsSection } from "../attachments/AttachmentsSection";

type Props = {
  eventId: string;
};

export function EventPhotosTab({ eventId }: Props) {
  return (
    <section className="space-y-4" data-testid="event-photos-tab">
      <div>
        <h2 className="font-display text-lg">Event photo gallery</h2>
        <p className="text-[13px] text-ink-2">
          Upload setup, food, service, and venue photos. Empty gallery starts
          with the upload action below.
        </p>
      </div>
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
