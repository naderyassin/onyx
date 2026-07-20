"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  children: React.ReactNode;
}

export function ConfirmDialog({
  title,
  description,
  actionLabel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="rounded-3xl border-white/12 bg-[#101010] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="ghost" className="h-10 rounded-xl px-4">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              onClick={onConfirm}
              className="h-10 rounded-xl bg-white px-4 text-black hover:bg-white/90"
            >
              {actionLabel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
