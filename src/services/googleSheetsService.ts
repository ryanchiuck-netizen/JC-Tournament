const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbxvoYQvw9S3ctCEuShwtHyZL19IZnu2HeXK7ZQp-HYs5cReS0mvNZL_vid8wifj88vyDg/exec";

export const saveToGoogleSheets = async (sheetName: string, data: any) => {
  try {
    await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      mode: 'no-cors', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetName, data }),
    });
    return true;
  } catch (error) {
    console.error("Save failed:", error);
    return false;
  }
};
