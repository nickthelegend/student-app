"use client"

import { BlurView } from "expo-blur"
import { LinearGradient } from "expo-linear-gradient"
import { router } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"

import { ThemedText } from "@/components/ThemedText"
import { DeviceManager } from "@/lib/deviceManager"
import { supabase } from "@/lib/supabase"
import { FontAwesome5, MaterialIcons } from "@expo/vector-icons"

const { width, height } = Dimensions.get("window")

export default function LoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [generalError, setGeneralError] = useState("")
  const [isKeyboardVisible, setKeyboardVisible] = useState(false)

  // Check if user is already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // User is already logged in, redirect to tabs
        router.replace("/(tabs)")
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        router.replace("/(tabs)")
      }
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const keyboardDidShowListener =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true))
        : Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true))

    const keyboardDidHideListener =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false))
        : Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false))

    return () => {
      keyboardDidShowListener.remove()
      keyboardDidHideListener.remove()
    }
  }, [])

  const validateForm = () => {
    let isValid = true
    setEmailError("")
    setPasswordError("")
    setGeneralError("")

    if (!email) {
      setEmailError("Email is required")
      isValid = false
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address")
      isValid = false
    }

    if (!password) {
      setPasswordError("Password is required")
      isValid = false
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters")
      isValid = false
    }

    return isValid
  }

  const checkDeviceConflicts = async (currentDeviceId: string, currentUserEmail: string) => {
    try {
      console.log("Checking device conflicts for device:", currentDeviceId)
      console.log("Current user email:", currentUserEmail)

      // Check if any students are already using this device ID
      const { data: conflictingStudents, error } = await supabase
        .from("students")
        .select("id, name, email, roll_number, user_id, device_id")
        .eq("device_id", currentDeviceId)

      if (error) {
        console.error("Error checking device conflicts:", error)
        return {
          hasConflict: false,
          message: "Error checking device conflicts",
        }
      }

      console.log("Found students with this device ID:", conflictingStudents)

      if (!conflictingStudents || conflictingStudents.length === 0) {
        console.log("No device conflicts found")
        return {
          hasConflict: false,
          message: "No conflicts",
        }
      }

      // Check if the current user is among the conflicting students
      const currentUserStudent = conflictingStudents.find((student) => student.email === currentUserEmail)

      if (conflictingStudents.length === 1 && currentUserStudent) {
        // Only the current user has this device ID - no conflict
        console.log("Device is registered to current user only")
        return {
          hasConflict: false,
          message: "Device belongs to current user",
        }
      }

      if (conflictingStudents.length > 1) {
        // Multiple students have the same device ID - this is a conflict
        console.log("Multiple students found with same device ID:", conflictingStudents.length)
        const otherStudents = conflictingStudents.filter((student) => student.email !== currentUserEmail)

        return {
          hasConflict: true,
          message: `Login denied. This device is already registered to ${otherStudents[0]?.name} (${otherStudents[0]?.roll_number}). Please login with the device you registered first or contact administrator.`,
          conflictingStudents: otherStudents,
        }
      }

      if (conflictingStudents.length === 1 && !currentUserStudent) {
        // Device belongs to a different student
        const otherStudent = conflictingStudents[0]
        console.log("Device belongs to different student:", otherStudent.name)

        return {
          hasConflict: true,
          message: `Login denied. This device is already registered to ${otherStudent.name} (${otherStudent.roll_number}). Please login with the device you registered first or contact administrator.`,
          conflictingStudents: [otherStudent],
        }
      }

      return {
        hasConflict: false,
        message: "No conflicts detected",
      }
    } catch (error) {
      console.error("Error in checkDeviceConflicts:", error)
      return {
        hasConflict: false,
        message: "Error checking conflicts",
      }
    }
  }

  const handleLogin = async () => {
    if (!validateForm()) return

    setLoading(true)
    try {
      // Get current device ID
      const currentDeviceId = await DeviceManager.getOrCreateDeviceId()
      console.log("Current device ID:", currentDeviceId)

      // First, authenticate the user
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        if (authError.message.includes("Invalid login")) {
          setGeneralError("Invalid email or password")
        } else {
          setGeneralError(authError.message)
        }
        Alert.alert("Login Error", authError.message)
        setLoading(false)
        return
      }

      if (!authData.user) {
        setGeneralError("Authentication failed")
        setLoading(false)
        return
      }

      console.log("Authentication successful for user:", authData.user.email)

      // Check for device conflicts before proceeding
      const conflictCheck = await checkDeviceConflicts(currentDeviceId, authData.user.email!)

      if (conflictCheck.hasConflict) {
        console.log("Device conflict detected, signing out user")

        // Sign out the user immediately
        await supabase.auth.signOut()

        // Show error message
        Alert.alert(
          "Login Denied",
          conflictCheck.message,
          [
            {
              text: "Contact Administrator",
              onPress: () => {
                Alert.alert(
                  "Contact Administrator",
                  "Please contact your administrator to resolve this device registration issue.",
                )
              },
            },
            {
              text: "OK",
              style: "default",
            },
          ],
          { cancelable: false },
        )

        setGeneralError("Device conflict detected")
        setLoading(false)
        return
      }

      // No conflicts, check if user needs device registration
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id, name, email, roll_number, device_id")
        .eq("user_id", authData.user.id)
        .single()

      if (studentError) {
        console.error("Error fetching student data:", studentError)
        await supabase.auth.signOut()
        Alert.alert("Error", "Student record not found. Please contact administrator.")
        setLoading(false)
        return
      }

      if (!studentData) {
        await supabase.auth.signOut()
        Alert.alert("Error", "No student record found. Please contact administrator.")
        setLoading(false)
        return
      }

      // If student doesn't have a device ID, register current device
      if (!studentData.device_id) {
        console.log("Registering device for student:", studentData.name)

        const { error: updateError } = await supabase
          .from("students")
          .update({
            device_id: currentDeviceId,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", authData.user.id)

        if (updateError) {
          console.error("Error registering device:", updateError)
          await supabase.auth.signOut()
          Alert.alert("Error", "Failed to register device. Please try again.")
          setLoading(false)
          return
        }

        console.log("Device registered successfully for:", studentData.name)
        Alert.alert("Device Registered", `Welcome ${studentData.name}! Your device has been registered successfully.`)
      } else if (studentData.device_id === currentDeviceId) {
        console.log("Device validation successful for:", studentData.name)
      } else {
        // This shouldn't happen due to our conflict check, but just in case
        console.log("Device mismatch detected")
        await supabase.auth.signOut()
        Alert.alert(
          "Device Not Authorized",
          `This device is not registered for ${studentData.name}. Please use your registered device or contact administrator.`,
        )
        setLoading(false)
        return
      }

      console.log("Login successful, proceeding to app")
      // Navigation will be handled by onAuthStateChange
    } catch (error: any) {
      console.error("Unexpected error during login:", error)
      setGeneralError("An unexpected error occurred. Please try again.")
      Alert.alert("Login Error", error.message || "An unexpected error occurred.")

      // Sign out user in case of any error
      try {
        await supabase.auth.signOut()
      } catch (signOutError) {
        console.error("Error signing out after login failure:", signOutError)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#4776E6", "#8E54E9"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.backgroundCircle1} />
        <View style={styles.backgroundCircle2} />

        <View style={styles.logoContainer}>
          <View style={styles.logoIconContainer}>
            <FontAwesome5 name="user-check" size={40} color="#ffffff" style={styles.logoIcon} />
          </View>
          <View style={styles.logoTextContainer}>
            <ThemedText style={styles.logoText}>Student Attendance</ThemedText>
            <ThemedText style={styles.logoSubText}>Management System</ThemedText>
          </View>
        </View>

        <BlurView intensity={Platform.OS === "ios" ? 30 : 80} tint="light" style={styles.formContainer}>
          <ThemedText style={styles.title}>Welcome Back</ThemedText>
          <ThemedText style={styles.subtitle}>Sign in to continue</ThemedText>

          {generalError ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={16} color="#FF3B30" />
              <ThemedText style={styles.errorText}>{generalError}</ThemedText>
            </View>
          ) : null}

          <View style={styles.inputWrapper}>
            <ThemedText style={styles.inputLabel}>Email Address</ThemedText>
            <View style={[styles.inputContainer, emailError ? styles.inputError : null]}>
              <MaterialIcons name="email" size={20} color="#8E54E9" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#A0A0A0"
                value={email}
                onChangeText={(text) => {
                  setEmail(text)
                  setEmailError("")
                  setGeneralError("")
                }}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            {emailError ? <ThemedText style={styles.fieldErrorText}>{emailError}</ThemedText> : null}
          </View>

          <View style={styles.inputWrapper}>
            <ThemedText style={styles.inputLabel}>Password</ThemedText>
            <View style={[styles.inputContainer, passwordError ? styles.inputError : null]}>
              <MaterialIcons name="lock" size={20} color="#8E54E9" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={(text) => {
                  setPassword(text)
                  setPasswordError("")
                  setGeneralError("")
                }}
                secureTextEntry
              />
            </View>
            {passwordError ? <ThemedText style={styles.fieldErrorText}>{passwordError}</ThemedText> : null}
          </View>

          <TouchableOpacity style={styles.forgotPassword}>
            <ThemedText style={styles.forgotPasswordText}>Forgot Password?</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <ThemedText style={styles.loginButtonText}>Sign In</ThemedText>
                <MaterialIcons name="arrow-forward" size={20} color="#ffffff" style={styles.buttonIcon} />
              </>
            )}
          </TouchableOpacity>

          {!isKeyboardVisible && (
            <View style={styles.footer}>
              <ThemedText style={styles.footerText}>Don't have an account?</ThemedText>
              <TouchableOpacity>
                <ThemedText style={styles.signupText}>Contact Admin</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </BlurView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    position: "relative",
    overflow: "hidden",
  },
  backgroundCircle1: {
    position: "absolute",
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    top: -width * 0.2,
    left: -width * 0.2,
  },
  backgroundCircle2: {
    position: "absolute",
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    bottom: -width * 0.1,
    right: -width * 0.1,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
    flexDirection: "row",
  },
  logoIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  logoIcon: {
    marginBottom: 0,
  },
  logoTextContainer: {
    flexDirection: "column",
  },
  logoText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  logoSubText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 5,
  },
  formContainer: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    overflow: "hidden",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 25,
    textAlign: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  inputWrapper: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 15,
    backgroundColor: "#FFFFFF",
    height: 55,
  },
  inputError: {
    borderColor: "#FF3B30",
    borderWidth: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: "100%",
    color: "#333",
    fontSize: 16,
  },
  fieldErrorText: {
    color: "#FF3B30",
    fontSize: 12,
    marginTop: 5,
    marginLeft: 5,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 25,
  },
  forgotPasswordText: {
    color: "#8E54E9",
    fontSize: 14,
    fontWeight: "600",
  },
  loginButton: {
    backgroundColor: "#8E54E9",
    borderRadius: 12,
    height: 55,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#8E54E9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 30,
  },
  footerText: {
    color: "#666",
    fontSize: 14,
  },
  signupText: {
    color: "#8E54E9",
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 5,
  },
})
