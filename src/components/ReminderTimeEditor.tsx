import { useState } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Clock, X } from 'lucide-react'
import { projectId } from '../utils/supabase/info'

interface ReminderTimeEditorProps {
  medicationId: string
  medicationName: string
  currentReminderTime?: string
  accessToken: string
  onUpdate: (reminderTime: string | undefined) => void
}

export function ReminderTimeEditor({ 
  medicationId, 
  medicationName, 
  currentReminderTime, 
  accessToken,
  onUpdate 
}: ReminderTimeEditorProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [reminderTime, setReminderTime] = useState(currentReminderTime || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medications/${medicationId}/reminder`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ reminderTime: reminderTime || undefined })
        }
      )

      if (response.ok) {
        onUpdate(reminderTime || undefined)
        setShowDialog(false)
      } else {
        alert('Failed to update reminder time')
      }
    } catch (error) {
      console.error('Error updating reminder:', error)
      alert('Failed to update reminder time')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveReminder = async () => {
    setSaving(true)
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medications/${medicationId}/reminder`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ reminderTime: undefined })
        }
      )

      if (response.ok) {
        setReminderTime('')
        onUpdate(undefined)
        setShowDialog(false)
      } else {
        alert('Failed to remove reminder')
      }
    } catch (error) {
      console.error('Error removing reminder:', error)
      alert('Failed to remove reminder')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="p-2"
        title={currentReminderTime ? `Reminder set for ${currentReminderTime}` : 'Set reminder time'}
      >
        <Clock className={`w-4 h-4 ${currentReminderTime ? 'text-primary' : ''}`} />
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Reminder Time</DialogTitle>
            <DialogDescription>
              Set a daily reminder time for {medicationName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">

            <div className="space-y-2">
              <Label htmlFor="reminderTime">Reminder Time</Label>
              <Input
                id="reminderTime"
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving || !reminderTime}
                className="flex-1"
              >
                {saving ? 'Saving...' : 'Save Reminder'}
              </Button>
              {currentReminderTime && (
                <Button
                  onClick={handleRemoveReminder}
                  disabled={saving}
                  variant="outline"
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
