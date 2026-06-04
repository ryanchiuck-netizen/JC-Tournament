export const saveToGoogleSheets = async (sheetName: string, data: any) => {
  try {
    const response = await fetch("/api/save-google-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetName, data }),
    });
    if (!response.ok) {
      throw new Error(`Proxy response error status: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error("Save failed:", error);
    return false;
  }
};
