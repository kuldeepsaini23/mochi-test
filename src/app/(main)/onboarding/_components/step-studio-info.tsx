"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CountrySelect } from "./country-select";
import { PhoneNumberInput } from "./phone-input";

const studioInfoSchema = z.object({
  studioName: z.string().min(1, "Studio name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  country: z.string().min(1, "Country is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State/Province is required"),
  zipCode: z.string().min(1, "ZIP/Postal code is required"),
});

export type StudioInfoData = z.infer<typeof studioInfoSchema>;

interface StepStudioInfoProps {
  value?: StudioInfoData;
  onChange: (data: StudioInfoData) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepStudioInfo({ value, onChange, onNext, onBack }: StepStudioInfoProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<StudioInfoData>({
    resolver: zodResolver(studioInfoSchema),
    mode: "onChange",
    values: value || {
      studioName: "",
      phoneNumber: "",
      country: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
    },
  });

  const handleFieldChange = (field: keyof StudioInfoData, fieldValue: string) => {
    setValue(field, fieldValue, { shouldValidate: true });
    const updatedData = { ...value, [field]: fieldValue } as StudioInfoData;
    onChange(updatedData);
  };

  const onSubmit = () => {
    onNext();
  };

  // Check if all fields are filled
  const isFormValid = value &&
    value.studioName?.trim() !== "" &&
    value.phoneNumber?.trim() !== "" &&
    value.country?.trim() !== "" &&
    value.address?.trim() !== "" &&
    value.city?.trim() !== "" &&
    value.state?.trim() !== "" &&
    value.zipCode?.trim() !== "";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Studio Information
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Tell us about your studio
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="studioName">Studio Name</Label>
            <Input
              id="studioName"
              placeholder="Enter your studio name"
              {...register("studioName", {
                onChange: (e) => handleFieldChange("studioName", e.target.value)
              })}
            />
            {errors.studioName && (
              <p className="text-sm text-destructive">{errors.studioName.message}</p>
            )}
          </div>

          <PhoneNumberInput
            value={value?.phoneNumber || ""}
            onChange={(newValue) => handleFieldChange("phoneNumber", newValue)}
            id="phoneNumber"
            label="Phone Number"
            error={errors.phoneNumber?.message}
          />

          <div>
            <CountrySelect
              value={value?.country || ""}
              onValueChange={(newValue) => handleFieldChange("country", newValue)}
              id="country"
            />
            {errors.country && (
              <p className="text-sm text-destructive mt-1">{errors.country.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="Street address"
              {...register("address", {
                onChange: (e) => handleFieldChange("address", e.target.value)
              })}
            />
            {errors.address && (
              <p className="text-sm text-destructive">{errors.address.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="City"
                {...register("city", {
                  onChange: (e) => handleFieldChange("city", e.target.value)
                })}
              />
              {errors.city && (
                <p className="text-sm text-destructive">{errors.city.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                placeholder="State"
                {...register("state", {
                  onChange: (e) => handleFieldChange("state", e.target.value)
                })}
              />
              {errors.state && (
                <p className="text-sm text-destructive">{errors.state.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zipCode">ZIP/Postal Code</Label>
            <Input
              id="zipCode"
              placeholder="ZIP code"
              {...register("zipCode", {
                onChange: (e) => handleFieldChange("zipCode", e.target.value)
              })}
            />
            {errors.zipCode && (
              <p className="text-sm text-destructive">{errors.zipCode.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
          Back
        </Button>
        <Button type="submit" disabled={!isFormValid} className="w-full sm:w-auto">
          Continue
        </Button>
      </div>
    </form>
  );
}
