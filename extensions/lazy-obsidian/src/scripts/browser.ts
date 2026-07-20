export const SUPPORTED_BROWSERS = [
  "Safari",
  "Arc",
  "Google Chrome",
  "Microsoft Edge",
  "Brave Browser",
  "Firefox",
  "Opera",
  "Vivaldi",
];

/** Prefer first frontmost process name (list form is ambiguous as a string). */
export const GET_ACTIVE_APP_SCRIPT = `
tell application "System Events"
  name of first application process whose frontmost is true
end tell
`;

export const GET_LINK_FROM_ARC_SCRIPT = `
tell application "Arc"
  return URL of active tab of front window & "\\t" & title of active tab of front window
end tell
`;

export const GET_LINK_FROM_SAFARI_SCRIPT = `
tell application "Safari"
  if (exists front document) then
    return URL of front document & "\\t" & name of front document
  else
    error "Safari is not displaying a web page!"
  end if
end tell
`;

export const GET_LINK_FROM_BROWSER_SCRIPT = (browser: string) => {
  if (browser === "Safari") {
    return GET_LINK_FROM_SAFARI_SCRIPT;
  }
  if (browser === "Arc") {
    return GET_LINK_FROM_ARC_SCRIPT;
  }
  // Chromium-family + others that expose active tab of front window
  return `
tell application "${browser}"
  if (exists active tab of front window) then
    return URL of active tab of front window & "\\t" & title of active tab of front window
  else
    error "${browser} is not displaying a web page!"
  end if
end tell`;
};
