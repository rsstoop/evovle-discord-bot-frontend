"use client"

import * as React from "react"
import { addDays, format, startOfMonth, startOfWeek, subDays, isSameDay, subMonths } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  date: DateRange | undefined
  onDateChange: (date: DateRange | undefined) => void
}

const presets = [
  {
    label: "Week to date",
    getValue: () => {
      const today = new Date()
      return {
        from: startOfWeek(today),
        to: today,
      }
    },
  },
  {
    label: "Month to date",
    getValue: () => {
      const today = new Date()
      return {
        from: startOfMonth(today),
        to: today,
      }
    },
  },
  {
    label: "Last 7 days",
    getValue: () => {
      const today = new Date()
      return {
        from: subDays(today, 6),
        to: today,
      }
    },
  },
  {
    label: "Last 14 days",
    getValue: () => {
      const today = new Date()
      return {
        from: subDays(today, 13),
        to: today,
      }
    },
  },
  {
    label: "Last 30 days",
    getValue: () => {
      const today = new Date()
      return {
        from: subDays(today, 29),
        to: today,
      }
    },
  },
]

export function DateRangePicker({
  className,
  date,
  onDateChange,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    const today = new Date()
    // Left calendar month = previous month, right = current month
    return subMonths(startOfMonth(today), 1)
  })

  // Derive which preset (if any) matches the current selected date range
  const activePresetLabel = React.useMemo(() => {
    if (!date?.from || !date?.to) return null
    for (const preset of presets) {
      const presetRange = preset.getValue()
      if (
        presetRange.from &&
        presetRange.to &&
        isSameDay(presetRange.from, date.from) &&
        isSameDay(presetRange.to, date.to)
      ) {
        return preset.label
      }
    }
    return null
  }, [date])

  const handlePresetClick = (preset: typeof presets[0]) => {
    const newDate = preset.getValue()
    onDateChange(newDate)
    // When clicking a preset, also ensure the calendar shows the preset's end month on the right
    if (newDate.to) {
      const endMonth = startOfMonth(newDate.to)
      setCurrentMonth(subMonths(endMonth, 1))
    }
  }

  const handleCalendarSelect = (newDate: DateRange | undefined) => {
    onDateChange(newDate)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[260px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex">
            <div className="flex flex-col gap-2 p-3 border-r border-border">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant={activePresetLabel === preset.label ? "default" : "ghost"}
                  className={cn(
                    "justify-start font-normal text-sm h-9",
                    activePresetLabel === preset.label
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent/60"
                  )}
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="p-3">
              <Calendar
                initialFocus
                mode="range"
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                selected={date}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

