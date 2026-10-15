import { useState } from "react";
import { SmartDatetimeInput } from "./datetime-picker";

export function DatetimePickerDefault() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
  };

  return (
    <div className="p-4 max-w-md mx-auto py-10">
      <SmartDatetimeInput
        value={selectedDate}
        onValueChange={handleDateChange}
        placeholder="Enter a date and time"
        className="lg:w-96"
      />
    </div>
  );
}

export function DatetimePickerTimeOnly() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
  };

  return (
    <div className="p-4 max-w-md mx-auto py-10">
      <SmartDatetimeInput
        value={selectedDate}
        showCalendar={false}
        showTimePicker={true}
        onValueChange={handleDateChange}
        placeholder="Enter a date and time"
        className="lg:w-96"
      />
    </div>
  );
}

export function DatetimePickerDateOnly() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
  };

  return (
    <div className="p-4 max-w-md mx-auto py-10">
      <SmartDatetimeInput
        value={selectedDate}
        showCalendar={true}
        showTimePicker={false}
        onValueChange={handleDateChange}
        placeholder="Enter a date and time"
        className="lg:w-96"
      />
    </div>
  );
}
