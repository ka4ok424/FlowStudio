import { useWorkflowStore } from "../../store/workflowStore";

function CropProperties({ nodeId, data }: { nodeId: string; data: any }) {
  const updateWidgetValue = useWorkflowStore((s) => s.updateWidgetValue);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const wv = data.widgetValues || {};
  const cropX: number = wv.cropX ?? 0;
  const cropY: number = wv.cropY ?? 0;
  const cropW: number = wv.cropW ?? 0;
  const cropH: number = wv.cropH ?? 0;
  const aspect: string = wv.aspect ?? "custom";
  const previewUrl: string | null = wv._previewUrl || null;
  const extractedSize: string | null = wv._extractedSize || null;

  const inputEdge = edges.find((e: any) => e.target === nodeId && e.targetHandle === "input");
  const srcNode = inputEdge ? nodes.find((n: any) => n.id === inputEdge.source) : null;
  const sd = srcNode?.data as any;
  const srcInfo = sd?.widgetValues?._fileInfo || {};
  const srcResolution: string = srcInfo.resolution || "—";

  if (!inputEdge) {
    return <div className="props-empty">Connect an IMAGE input</div>;
  }

  const setCoord = (key: "cropX" | "cropY" | "cropW" | "cropH") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseInt(e.target.value, 10);
    updateWidgetValue(nodeId, key, isNaN(n) ? 0 : Math.max(0, n));
  };

  return (
    <>
      {previewUrl && (
        <div className="props-preview">
          <img src={previewUrl} alt="cropped" />
        </div>
      )}

      <div className="props-info-card">
        <div className="props-info-header"><span>SOURCE</span></div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Resolution</span>
            <span className="props-info-value">{srcResolution}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Aspect lock</span>
            <span className="props-info-value">{aspect === "manual" ? `${wv.manualW || 1}:${wv.manualH || 1}` : aspect}</span>
          </div>
        </div>
      </div>

      <div className="props-info-card">
        <div className="props-info-header"><span>OUTPUT</span></div>
        <div className="props-info-rows">
          <div className="props-info-row">
            <span className="props-info-label">Size</span>
            <span className="props-info-value">{extractedSize || (cropW && cropH ? `${cropW} × ${cropH}` : "—")}</span>
          </div>
          <div className="props-info-row">
            <span className="props-info-label">Format</span>
            <span className="props-info-value">PNG (lossless)</span>
          </div>
        </div>
      </div>

      <div className="props-section">
        <div className="props-section-title">Manual crop coords</div>
        <div className="props-input-row" style={{ gap: 6 }}>
          <label className="props-info-label" style={{ minWidth: 14 }}>X</label>
          <input type="number" className="props-input" value={cropX} min={0} onChange={setCoord("cropX")} />
          <label className="props-info-label" style={{ minWidth: 14 }}>Y</label>
          <input type="number" className="props-input" value={cropY} min={0} onChange={setCoord("cropY")} />
        </div>
        <div className="props-input-row" style={{ gap: 6, marginTop: 6 }}>
          <label className="props-info-label" style={{ minWidth: 14 }}>W</label>
          <input type="number" className="props-input" value={cropW} min={1} onChange={setCoord("cropW")} />
          <label className="props-info-label" style={{ minWidth: 14 }}>H</label>
          <input type="number" className="props-input" value={cropH} min={1} onChange={setCoord("cropH")} />
        </div>
      </div>
    </>
  );
}

export default CropProperties;
