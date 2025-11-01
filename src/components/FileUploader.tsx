import { UploadCloud, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface FileUploaderProps {
  variant?: "default" | "compact";
  onBrowseClick: () => void;
  disabled?: boolean;
}

export const FileUploader = ({
  variant = "default",
  onBrowseClick,
  disabled = false,
}: FileUploaderProps) => {

  if (variant === "compact") {
    return (
      <Button
        variant="outline"
        disabled={disabled}
        className="text-sm"
        onClick={onBrowseClick}
      >
        <Folder className="h-4 w-4 mr-2" />
        {disabled ? "Loading..." : "New Session(s)"}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "border-2 border-dashed border-border rounded-lg p-12 text-center",
        disabled ? "opacity-50" : "",
      )}
    >
      <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">
        {disabled
          ? "Processing..."
          : "Drag & drop folder(s) anywhere"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {disabled
          ? "Please wait while data is parsed."
          : "Upload one or more folders containing your .csv files"}
      </p>
      <Button
        type="button"
        className="mt-4"
        disabled={disabled}
        onClick={onBrowseClick}
      >
        Or click to select folder(s)
      </Button>
    </div>
  );
};