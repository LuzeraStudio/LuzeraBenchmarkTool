import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, File as FileIcon, Folder } from "lucide-react"; // Import Folder icon
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useBenchmarkData } from "@/contexts/BenchmarkContext"; // Import context hook

interface FileUploaderProps {
  variant?: "default" | "compact";
}

export const FileUploader = ({ variant = "default" }: FileUploaderProps) => {
  const { loadDataFromFiles, isLoading } = useBenchmarkData();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!isLoading) {
        loadDataFromFiles(acceptedFiles);
      }
    },
    [isLoading, loadDataFromFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    disabled: isLoading, // Disable dropzone while loading
  });

  if (variant === "compact") {
    return (
      <Button
        {...getRootProps()}
        variant="outline"
        disabled={isLoading}
        className="text-sm"
      >
        <input {...getInputProps()} webkitdirectory="" />
        <Folder className="h-4 w-4 mr-2" />
        {isLoading ? "Loading..." : "New Session"}
      </Button>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer transition-colors",
        isDragActive
          ? "border-primary bg-primary/10"
          : "hover:border-primary/50",
        isLoading ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      <input {...getInputProps()} webkitdirectory="" />
      <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">
        {isLoading
          ? "Processing..."
          : isDragActive
            ? "Drop the folder here"
            : "Drag & drop benchmark folder"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {isLoading
          ? "Please wait while data is parsed."
          : "Upload a folder containing your .csv files (StaticData, PerformanceLog, Events)"}
      </p>
      <Button type="button" className="mt-4" disabled={isLoading}>
        Or click to select a folder
      </Button>
    </div>
  );
};
