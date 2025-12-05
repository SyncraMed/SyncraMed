import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ConditionInfoModal } from "./ConditionInfoModal";
import { PlusCircle, X, Info } from "lucide-react";
import { projectId } from "../utils/supabase/info";

interface MedicalConditionsSectionProps {
  accessToken: string;
}

export function MedicalConditionsSection({
  accessToken,
}: MedicalConditionsSectionProps) {
  const [conditions, setConditions] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(
    null,
  );

  useEffect(() => {
    loadConditions();
  }, []);

  const loadConditions = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medical-conditions`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const data = await response.json();
      if (response.ok) {
        setConditions(data.conditions || []);
      } else {
        console.error("Failed to load conditions:", data.error);
      }
    } catch (error) {
      console.error("Error loading conditions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCondition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCondition.trim()) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medical-conditions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ condition: newCondition.trim() }),
        },
      );
      const data = await response.json();
      if (response.ok) {
        setConditions([...conditions, newCondition.trim()]);
        setNewCondition("");
      } else {
        console.error("Failed to add condition:", data.error);
        alert("Failed to add condition");
      }
    } catch (error) {
      console.error("Error adding condition:", error);
      alert("Failed to add condition");
    }
  };

  const handleRemoveCondition = async (condition: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medical-conditions`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ condition }),
        },
      );
      if (response.ok) {
        setConditions(conditions.filter((c) => c !== condition));
      } else {
        console.error("Failed to remove condition");
        alert("Failed to remove condition");
      }
    } catch (error) {
      console.error("Error removing condition:", error);
      alert("Failed to remove condition");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medical Conditions</CardTitle>
        <CardDescription>
          Track your medical conditions and health history
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            <form onSubmit={handleAddCondition} className="flex gap-2">
              <Input
                value={newCondition}
                onChange={(e) => setNewCondition(e.target.value)}
                placeholder="Add a condition (e.g., Hypertension)"
                className="flex-1"
              />
              <Button type="submit" size="sm" className="gap-2">
                <PlusCircle className="w-4 h-4" />
                Add
              </Button>
            </form>

            {conditions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No medical conditions recorded yet
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {conditions.map((condition, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="px-3 py-1.5 gap-1.5 flex items-center"
                  >
                    <span>{condition}</span>
                    <button
                      onClick={() => setSelectedCondition(condition)}
                      className="hover:text-blue-500 transition-colors ml-1"
                      type="button"
                      title="View information"
                    >
                      <Info className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemoveCondition(condition)}
                      className="hover:text-destructive transition-colors"
                      type="button"
                      title="Remove condition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {selectedCondition && (
        <ConditionInfoModal
          conditionName={selectedCondition}
          accessToken={accessToken}
          onClose={() => setSelectedCondition(null)}
        />
      )}
    </Card>
  );
}