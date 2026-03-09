import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Settings2, GripVertical, RotateCcw } from "lucide-react";
import type { DashboardWidget } from "@/hooks/useDashboardLayout";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  widgets: DashboardWidget[];
  onToggle: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onReset: () => void;
}

function SortableItem({ widget, onToggle }: { widget: DashboardWidget; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Switch checked={widget.visible} onCheckedChange={() => onToggle(widget.id)} className="shrink-0" />
      <span className="text-sm text-foreground flex-1">{widget.label}</span>
    </div>
  );
}

export default function DashboardCustomizer({ widgets, onToggle, onReorder, onReset }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex(w => w.id === active.id);
    const newIndex = widgets.findIndex(w => w.id === over.id);
    const reordered = arrayMove(widgets, oldIndex, newIndex);
    onReorder(reordered.map(w => w.id));
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 h-9">
          <Settings2 className="h-3.5 w-3.5" /> Customize
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle className="text-foreground">Customize Dashboard</SheetTitle>
        </SheetHeader>
        <p className="text-xs text-muted-foreground mt-2 mb-4">Drag to reorder, toggle to show/hide widgets.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {widgets.map(w => (
                <SortableItem key={w.id} widget={w} onToggle={onToggle} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Button size="sm" variant="ghost" className="mt-4 gap-1.5 text-muted-foreground" onClick={onReset}>
          <RotateCcw className="h-3 w-3" /> Reset to Default
        </Button>
      </SheetContent>
    </Sheet>
  );
}
