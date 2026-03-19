"use client";

import { Fragment, useId, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const countries = [
  {
    continent: "America",
    items: [
      { code: "US", name: "United States", flag: "🇺🇸" },
      { code: "CA", name: "Canada", flag: "🇨🇦" },
      { code: "MX", name: "Mexico", flag: "🇲🇽" },
    ],
  },
  {
    continent: "Africa",
    items: [
      { code: "ZA", name: "South Africa", flag: "🇿🇦" },
      { code: "NG", name: "Nigeria", flag: "🇳🇬" },
      { code: "MA", name: "Morocco", flag: "🇲🇦" },
    ],
  },
  {
    continent: "Asia",
    items: [
      { code: "CN", name: "China", flag: "🇨🇳" },
      { code: "JP", name: "Japan", flag: "🇯🇵" },
      { code: "IN", name: "India", flag: "🇮🇳" },
    ],
  },
  {
    continent: "Europe",
    items: [
      { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
      { code: "FR", name: "France", flag: "🇫🇷" },
      { code: "DE", name: "Germany", flag: "🇩🇪" },
    ],
  },
  {
    continent: "Oceania",
    items: [
      { code: "AU", name: "Australia", flag: "🇦🇺" },
      { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
    ],
  },
];

interface CountrySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
}

export function CountrySelect({ value, onValueChange, id }: CountrySelectProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [open, setOpen] = useState<boolean>(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Country</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={inputId}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between border-input bg-background px-3 font-normal outline-offset-0 outline-none hover:bg-background focus-visible:outline-[3px]"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-lg leading-none">
                  {
                    countries
                      .map((group) =>
                        group.items.find((item) => item.code === value)
                      )
                      .filter(Boolean)[0]?.flag
                  }
                </span>
                <span className="truncate">
                  {
                    countries
                      .map((group) =>
                        group.items.find((item) => item.code === value)
                      )
                      .filter(Boolean)[0]?.name
                  }
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Select country</span>
            )}
            <ChevronDownIcon
              size={16}
              className="shrink-0 text-muted-foreground/80"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-full min-w-[var(--radix-popper-anchor-width)] border-input p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search country..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              {countries.map((group) => (
                <Fragment key={group.continent}>
                  <CommandGroup heading={group.continent}>
                    {group.items.map((country) => (
                      <CommandItem
                        key={country.code}
                        value={country.name}
                        onSelect={() => {
                          onValueChange(country.code);
                          setOpen(false);
                        }}
                      >
                        <span className="text-lg leading-none">
                          {country.flag}
                        </span>{" "}
                        {country.name}
                        {value === country.code && (
                          <CheckIcon size={16} className="ml-auto" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Fragment>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
