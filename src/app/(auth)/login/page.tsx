"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { EmailLoginForm } from "@/components/auth/email-login-form";
import { HelpCircle } from "lucide-react";
import Link from "next/link";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Choose your preferred sign-in method
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 text-sm text-destructive">
            {error === "auth_callback_failed"
              ? "Authentication failed. Please try again."
              : error}
          </p>
        )}
        <Tabs defaultValue="password" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">Email &amp; Password</TabsTrigger>
            <TabsTrigger value="magic-link" className="gap-1">
              Magic Link
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>We&apos;ll email you a one-click login link — no password needed</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="password" className="mt-4">
            <EmailPasswordForm />
          </TabsContent>
          <TabsContent value="magic-link" className="mt-4">
            <EmailLoginForm />
          </TabsContent>
        </Tabs>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Register
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
