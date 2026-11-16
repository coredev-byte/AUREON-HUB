// Formato de widget que os componentes do Widgy esperam (compatível com WidgetInstance do Aureon).
export interface Widget { id: string; type: string; x: number; y: number; w: number; h: number; config: Record<string, any> }
export interface MediaItem { id: string; file: string; name: string; width: number; height: number; createdAt: number; upscaled?: string; animated?: boolean; living?: boolean }
