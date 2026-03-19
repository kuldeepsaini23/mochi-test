import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function VerifyOTPPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Enter the 6-digit code from your authenticator app to continue
        </p>
      </div>

      <form className="grid gap-6">
        <div className="grid gap-2">
          <Label className="text-center block">Verification Code</Label>
          <div className="flex justify-center">
            <InputOTP maxLength={6}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <Button type="submit" className="w-full">
          Verify Code
        </Button>
      </form>

      <div className="text-center text-sm">
        <Link href="/sign-in" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
