export type FeedIconName = "plus" | "text" | "image" | "calendar" | "heart" | "search" | "arrow" | "people" | "expand" | "download" | "drive" | "browser" | "close";

const paths: Record<FeedIconName, string> = {
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5",
  drive: "M9 3h6l7 12-3 6H5l-3-6L9 3Zm0 0 10 18M15 3 5 21M2 15h20",
  browser: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 8h18M7 5.5h.01M10 5.5h.01M8 14l3 3 5-5",
  close: "m6 6 12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  text: "M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 13 5-5 4 4 4-5 5 5M8 7h.01",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM8 3v4M16 3v4M3 11h18M8 15h2M14 15h2",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  search: "M16 16l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  arrow: "m9 5 7 7-7 7",
  people: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-2a7 7 0 0 1 14 0v2M18 4a3 3 0 0 1 0 6M21 14l1 6",
};

export default function FeedIcon({ name }: { name: FeedIconName }) {
  return <svg className="worship-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
