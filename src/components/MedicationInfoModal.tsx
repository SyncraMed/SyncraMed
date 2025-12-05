import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { projectId } from "../utils/supabase/info";
import { AlertTriangle, Loader2, Pill } from "lucide-react";

interface MedicationInfoModalProps {
  medicationName: string;
  accessToken: string;
  onClose: () => void;
}

export function MedicationInfoModal({
  medicationName,
  accessToken,
  onClose,
}: MedicationInfoModalProps) {
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMedicationInfo();
  }, []);

  const fetchMedicationInfo = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medication-info`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ medicationName }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        setInfo(data.info);
      } else {
        setError(
          data.error ||
            "Failed to fetch medication information",
        );
      }
    } catch (err) {
      console.error("Error fetching medication info:", err);
      setError("Failed to fetch medication information");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-blue-100 shadow-lg">
        <CardHeader className="bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-blue-700" />
            <CardTitle className="text-blue-800">
              Medication Information: {medicationName}
            </CardTitle>
          </div>
          <CardDescription className="text-gray-600">
            AI-generated educational summary
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 p-6">
          <Alert className="bg-yellow-50 border-yellow-200">
            {/* Icon explicitly colored red for reliability */}
            <AlertTriangle
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              color="#dc2626"
              strokeWidth={1.8}
            />
            <AlertDescription className="text-yellow-800 text-sm leading-relaxed">
              <strong className="text-red-800 font-semibold">
                IMPORTANT DISCLAIMER:
              </strong>{" "}
              This AI-generated information is for educational
              purposes only. It is NOT a substitute for medical
              advice. Always consult your doctor or pharmacist
              before making any changes to your medications or
              treatment.
            </AlertDescription>
          </Alert>

          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-700">
              <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-600" />
              Loading medication details...
            </div>
          )}

          {error && (
            <Alert
              variant="destructive"
              className="border-red-300"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && info && (
            <div className="prose prose-blue max-w-none text-gray-800">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-xl font-bold text-blue-800 mb-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-semibold text-blue-700 mt-4 mb-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold text-blue-600 mt-3 mb-1">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-gray-700 leading-relaxed mb-2">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900">
                      {children}
                    </strong>
                  ),
                }}
              >
                {info}
              </ReactMarkdown>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={onClose} className="w-32">
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}