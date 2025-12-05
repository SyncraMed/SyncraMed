import { useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { MedicationInfoModal } from "./MedicationInfoModal";
import { ReminderTimeEditor } from "./ReminderTimeEditor";
import { Trash2, Info, Clock, Pill } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  createdAt: string;
  reminderTime?: string;
  refillDate?: string;
  supplyDays?: string;
}

interface MedicationCardProps {
  medication: Medication;
  taken: boolean;
  onMarkTaken: (taken: boolean) => void;
  onDelete: () => void;
  onUpdateReminder: (reminderTime: string | undefined) => void;
  accessToken: string;
}

/** 🔴 Delete Confirmation Button */
export function DeleteMedicationButton({
  onDelete,
}: {
  onDelete: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-700">
            Delete Medication
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-700">
            Are you sure you want to delete this medication from
            your medications list?{" "}
            <span className="font-medium text-red-600">
              This action cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 💊 Medication Card */
export function MedicationCard({
  medication,
  taken,
  onMarkTaken,
  onDelete,
  onUpdateReminder,
  accessToken,
}: MedicationCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <Card className="p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={taken}
            onCheckedChange={(checked) =>
              onMarkTaken(checked as boolean)
            }
            className="mt-1"
          />

          <div className="flex-1">
            <h3
              className={`font-semibold ${
                taken
                  ? "line-through text-muted-foreground"
                  : "text-gray-900"
              }`}
            >
              {medication.name}
            </h3>
            
            {/* Mobile: Compact single-line layout */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mt-0.5 sm:hidden">
              <span className="whitespace-nowrap">
                {medication.dosage} • {medication.frequency}x daily
              </span>

              {medication.reminderTime && (
                <span className="text-primary flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {medication.reminderTime}
                </span>
              )}

              {medication.refillDate &&
                medication.supplyDays &&
                (() => {
                  const refillDate = new Date(
                    medication.refillDate,
                  );
                  const supplyDays = parseInt(
                    medication.supplyDays,
                  );
                  const endDate = new Date(refillDate);
                  endDate.setDate(endDate.getDate() + supplyDays);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const daysLeft = Math.ceil(
                    (endDate.getTime() - today.getTime()) /
                      (1000 * 60 * 60 * 24),
                  );

                  return (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span
                        className={`flex items-center gap-1 font-medium ${
                          daysLeft <= 7
                            ? "text-destructive"
                            : daysLeft <= 14
                              ? "text-orange-600"
                              : "text-green-600"
                        }`}
                      >
                        <Pill className="w-3 h-3" />
                        {daysLeft > 0
                          ? `${daysLeft}d left`
                          : "Refill now!"}
                      </span>
                    </>
                  );
                })()}
            </div>

            {medication.refillDate && (
              <p className="text-sm text-muted-foreground mt-1 sm:hidden">
                Last Refilled: {(() => {
                  const date = new Date(medication.refillDate);
                  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                })()}
              </p>
            )}

            {/* Desktop: Stacked layout */}
            <div className="hidden sm:block">
              <p className="text-muted-foreground text-sm">
                {medication.dosage} • {medication.frequency}x daily
                {medication.refillDate && (() => {
                  const date = new Date(medication.refillDate);
                  const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                  return ` • Last Refilled: ${formattedDate}`;
                })()}
              </p>

              {medication.reminderTime && (
                <p className="text-sm text-primary flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" />
                  Reminder: {medication.reminderTime}
                </p>
              )}

              {medication.refillDate &&
                medication.supplyDays &&
                (() => {
                  const refillDate = new Date(
                    medication.refillDate,
                  );
                  const supplyDays = parseInt(
                    medication.supplyDays,
                  );
                  const endDate = new Date(refillDate);
                  endDate.setDate(endDate.getDate() + supplyDays);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const daysLeft = Math.ceil(
                    (endDate.getTime() - today.getTime()) /
                      (1000 * 60 * 60 * 24),
                  );

                  return (
                    <p
                      className={`text-sm flex items-center gap-1 mt-1 font-medium ${
                        daysLeft <= 7
                          ? "text-destructive"
                          : daysLeft <= 14
                            ? "text-orange-600"
                            : "text-green-600"
                      }`}
                    >
                      <Pill className="w-3 h-3" />
                      {daysLeft > 0
                        ? `Refill due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`
                        : "Refill needed now!"}
                    </p>
                  );
                })()}
            </div>
          </div>

          <div className="flex gap-2">
            <ReminderTimeEditor
              medicationId={medication.id}
              medicationName={medication.name}
              currentReminderTime={medication.reminderTime}
              accessToken={accessToken}
              onUpdate={onUpdateReminder}
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInfo(true)}
              className="h-8 w-8 p-0 hover:text-blue-600 hover:bg-blue-600/10"
            >
              <Info className="w-4 h-4" />
            </Button>

            <DeleteMedicationButton onDelete={onDelete} />
          </div>
        </div>
      </Card>

      {showInfo && (
        <MedicationInfoModal
          medicationName={medication.name}
          accessToken={accessToken}
          onClose={() => setShowInfo(false)}
        />
      )}
    </>
  );
}