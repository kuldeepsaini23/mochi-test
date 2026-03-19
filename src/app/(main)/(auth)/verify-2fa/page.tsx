import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Verify2FAPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">
          Set up Two-Factor Authentication
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          Secure your account with an additional layer of protection. You can
          skip this step and enable it later from settings.
        </p>
      </div>

      <form className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Verify Your Password</CardTitle>
            <CardDescription>
              Enter your password to generate your 2FA QR code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Enter your password" />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full">
          Generate QR Code
        </Button>

        <Button type="button" variant="ghost" className="w-full">
          Skip for now
        </Button>
      </form>
    </div>
  );
}
