export default function ChunkErrorFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Update available</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        The app was updated while you had this tab open. Refresh to load the latest version.
      </p>
      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        onClick={() => window.location.reload()}
      >
        Refresh page
      </button>
    </div>
  );
}
