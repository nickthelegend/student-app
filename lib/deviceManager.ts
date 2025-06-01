import * as SecureStore from "expo-secure-store"
import { supabase } from "./supabase"

export interface DeviceValidationResult {
  isValid: boolean
  message: string
  deviceId: string
}

// Simple UUID v4 generator function
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export class DeviceManager {
  private static readonly DEVICE_ID_KEY = "secure_deviceid"

  /**
   * Get or create a device ID for this device
   */
  static async getOrCreateDeviceId(): Promise<string> {
    try {
      // Try to get existing device ID
      const fetchUUID = await SecureStore.getItemAsync(this.DEVICE_ID_KEY)
      let uuid: string

      if (fetchUUID) {
        // Parse the stored UUID (it might be JSON stringified)
        try {
          uuid = JSON.parse(fetchUUID)
        } catch {
          // If it's not JSON, use it as is
          uuid = fetchUUID
        }
        console.log("Existing device ID found:", uuid)
      } else {
        // Create new device ID using our custom generator
        uuid = generateUUID()
        await SecureStore.setItemAsync(this.DEVICE_ID_KEY, JSON.stringify(uuid))
        console.log("New device ID created:", uuid)
      }

      return uuid
    } catch (error) {
      console.error("Error managing device ID:", error)
      // Fallback: create a new UUID
      const fallbackUuid = generateUUID()
      try {
        await SecureStore.setItemAsync(this.DEVICE_ID_KEY, JSON.stringify(fallbackUuid))
      } catch (storeError) {
        console.error("Error storing fallback device ID:", storeError)
      }
      return fallbackUuid
    }
  }

  /**
   * Validate if the current device is authorized for the student
   */
  static async validateDeviceForStudent(userId: string): Promise<DeviceValidationResult> {
    try {
      const currentDeviceId = await this.getOrCreateDeviceId()

      console.log("Validating device for user:", userId)
      console.log("Current device ID:", currentDeviceId)

      // Fetch student record
      const { data: student, error: fetchError } = await supabase
        .from("students")
        .select("id, device_id, name, roll_number")
        .eq("user_id", userId)
        .single()

      if (fetchError) {
        console.error("Error fetching student:", fetchError)
        return {
          isValid: false,
          message: "Error fetching student information. Please contact admin.",
          deviceId: currentDeviceId,
        }
      }

      if (!student) {
        return {
          isValid: false,
          message: "No student record found. Please contact admin.",
          deviceId: currentDeviceId,
        }
      }

      // Check if student has no device ID registered
      if (!student.device_id) {
        console.log("No device ID registered for student, registering current device")

        // Register current device
        const { error: updateError } = await supabase
          .from("students")
          .update({
            device_id: currentDeviceId,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)

        if (updateError) {
          console.error("Error registering device:", updateError)
          return {
            isValid: false,
            message: "Error registering device. Please try again.",
            deviceId: currentDeviceId,
          }
        }

        console.log("Device registered successfully for student:", student.name)
        return {
          isValid: true,
          message: "Device registered successfully.",
          deviceId: currentDeviceId,
        }
      }

      // Check if current device matches registered device
      if (student.device_id === currentDeviceId) {
        console.log("Device validation successful for student:", student.name)
        return {
          isValid: true,
          message: "Device validated successfully.",
          deviceId: currentDeviceId,
        }
      }

      // Device mismatch - unauthorized device
      console.log("Device mismatch for student:", student.name)
      console.log("Registered device:", student.device_id)
      console.log("Current device:", currentDeviceId)

      return {
        isValid: false,
        message: `This device is not authorized for ${student.name} (${student.roll_number}). Please use your registered device or contact admin to reset your device registration.`,
        deviceId: currentDeviceId,
      }
    } catch (error) {
      console.error("Error in device validation:", error)
      return {
        isValid: false,
        message: "Device validation failed. Please try again.",
        deviceId: await this.getOrCreateDeviceId(),
      }
    }
  }

  /**
   * Reset device registration for a student (admin function)
   */
  static async resetDeviceForStudent(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("students")
        .update({
          device_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)

      if (error) {
        console.error("Error resetting device:", error)
        return false
      }

      console.log("Device reset successfully for user:", userId)
      return true
    } catch (error) {
      console.error("Error in resetDeviceForStudent:", error)
      return false
    }
  }

  /**
   * Check if any other student is using this device
   */
  static async checkDeviceConflict(
    deviceId: string,
    excludeUserId?: string,
  ): Promise<{ hasConflict: boolean; conflictStudent?: any }> {
    try {
      let query = supabase.from("students").select("name, roll_number, user_id").eq("device_id", deviceId)

      if (excludeUserId) {
        query = query.neq("user_id", excludeUserId)
      }

      const { data: conflictStudents, error } = await query

      if (error) {
        console.error("Error checking device conflict:", error)
        return { hasConflict: false }
      }

      if (conflictStudents && conflictStudents.length > 0) {
        return {
          hasConflict: true,
          conflictStudent: conflictStudents[0],
        }
      }

      return { hasConflict: false }
    } catch (error) {
      console.error("Error in checkDeviceConflict:", error)
      return { hasConflict: false }
    }
  }

  /**
   * Get device info for debugging
   */
  static async getDeviceInfo(): Promise<{ deviceId: string; isStored: boolean }> {
    try {
      const storedId = await SecureStore.getItemAsync(this.DEVICE_ID_KEY)
      const deviceId = await this.getOrCreateDeviceId()

      return {
        deviceId,
        isStored: !!storedId,
      }
    } catch (error) {
      console.error("Error getting device info:", error)
      return {
        deviceId: "error",
        isStored: false,
      }
    }
  }
}
