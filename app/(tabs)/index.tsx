"use client"

import { Ionicons } from "@expo/vector-icons"
import type { User } from "@supabase/supabase-js"
import * as NearbyConnections from "expo-nearby-connections"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { PERMISSIONS, RESULTS, checkMultiple, requestMultiple } from "react-native-permissions"

import { ThemedText } from "@/components/ThemedText"
import { ThemedView } from "@/components/ThemedView"
import { useColorScheme } from "@/hooks/useColorScheme"
import { DeviceManager, type DeviceValidationResult } from "@/lib/deviceManager"
import { supabase } from "@/lib/supabase"

// Declare __DEV__ if it's not already defined
declare const __DEV__: boolean

interface Student {
  id: string
  user_id: string
  name: string
  email: string
  roll_number: string
  program_id: string
  current_year: number
  device_id?: string
}

async function checkAndRequestPermissions(): Promise<boolean> {
  const permissions =
    Platform.OS === "ios"
      ? [PERMISSIONS.IOS.BLUETOOTH]
      : [
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE,
          PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
          PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
          PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES,
        ]

  try {
    const statuses = await checkMultiple(permissions)
    const allGranted = Object.values(statuses).every(
      (status) => status === RESULTS.GRANTED || status === RESULTS.UNAVAILABLE || status === RESULTS.LIMITED,
    )

    if (allGranted) return true

    const requestStatuses = await requestMultiple(permissions)
    return Object.values(requestStatuses).every(
      (status) => status === RESULTS.GRANTED || status === RESULTS.UNAVAILABLE || status === RESULTS.LIMITED,
    )
  } catch (error) {
    console.error("Error checking permissions:", error)
    return false
  }
}

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [deviceValidation, setDeviceValidation] = useState<DeviceValidationResult | null>(null)
  const [broadcasting, setBroadcasting] = useState(false)
  const [permissionsGranted, setPermissionsGranted] = useState(false)
  const [myPeerId, setMyPeerId] = useState<string>("")
  const [debugInfo, setDebugInfo] = useState<string>("")
  const [hasPermissions, setHasPermissions] = useState(false)
  const colorScheme = useColorScheme()

  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()
      if (error) {
        Alert.alert("Error fetching session", error.message)
        setLoading(false)
        router.replace("/login")
        return
      }

      if (session) {
        setUser(session.user)
        await validateDeviceAndFetchStudent(session.user.id)
      } else {
        router.replace("/login")
      }
      setLoading(false)
    }

    fetchSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setLoading(false)
        router.replace("/login")
      } else {
        validateDeviceAndFetchStudent(session.user.id)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
      if (broadcasting) {
        stopBroadcasting()
      }
    }
  }, [])

  // Initialize permissions
  useEffect(() => {
    const initializePermissions = async () => {
      const granted = await checkAndRequestPermissions()
      setPermissionsGranted(granted)
      setHasPermissions(granted)
      if (!granted) {
        setDebugInfo((prev) => prev + "\nPermissions not granted")
      } else {
        setDebugInfo((prev) => prev + "\nPermissions granted successfully")
      }
    }

    initializePermissions()
  }, [])

  // Set up NearbyConnections listeners
  useEffect(() => {
    if (!permissionsGranted || !deviceValidation?.isValid) return

    // Listen for discovered peers (lecturers)
    const onPeerFoundListener = NearbyConnections.onPeerFound((data) => {
      console.log("Lecturer found:", data)
      setDebugInfo((prev) => prev + `\nLecturer found: ${JSON.stringify(data)}`)
    })

    const onPeerLostListener = NearbyConnections.onPeerLost((data) => {
      console.log("Lecturer lost:", data)
      setDebugInfo((prev) => prev + `\nLecturer lost: ${JSON.stringify(data)}`)
    })

    // Listen for connection requests from lecturers
    const onInvitationListener = NearbyConnections.onInvitationReceived((data) => {
      console.log("Connection request from lecturer:", data)
      setDebugInfo((prev) => prev + `\nConnection request from lecturer: ${JSON.stringify(data)}`)

      Alert.alert(
        "Attendance Request",
        `Lecturer ${data.name} is requesting your attendance. Accept?`,
        [
          {
            text: "Decline",
            onPress: () => handleRejectConnection(data.peerId),
            style: "cancel",
          },
          {
            text: "Accept",
            onPress: () => handleAcceptConnection(data.peerId),
          },
        ],
        { cancelable: false },
      )
    })

    const onConnectedListener = NearbyConnections.onConnected((data) => {
      console.log("Connected to lecturer:", data)
      setDebugInfo((prev) => prev + `\nConnected to lecturer: ${JSON.stringify(data)}`)

      // Send roll number to lecturer
      if (student?.roll_number) {
        try {
          NearbyConnections.sendText(data.peerId, student.roll_number)
          setDebugInfo((prev) => prev + `\nSent roll number: ${student.roll_number}`)
          Alert.alert("Attendance Sent", `Your roll number ${student.roll_number} has been sent to the lecturer.`)
        } catch (error) {
          console.error("Error sending roll number:", error)
          setDebugInfo((prev) => prev + `\nError sending roll number: ${error}`)
        }
      }
    })

    const onDisconnectedListener = NearbyConnections.onDisconnected((data) => {
      console.log("Disconnected from lecturer:", data)
      setDebugInfo((prev) => prev + `\nDisconnected from lecturer: ${JSON.stringify(data)}`)
    })

    return () => {
      onPeerFoundListener()
      onPeerLostListener()
      onInvitationListener()
      onConnectedListener()
      onDisconnectedListener()
    }
  }, [permissionsGranted, student, deviceValidation])

  const validateDeviceAndFetchStudent = async (userId: string) => {
    try {
      setDebugInfo((prev) => prev + `\nValidating device for user: ${userId}`)

      // Validate device first
      const validation = await DeviceManager.validateDeviceForStudent(userId)
      setDeviceValidation(validation)

      setDebugInfo((prev) => prev + `\nDevice validation result: ${validation.isValid ? "Valid" : "Invalid"}`)
      setDebugInfo((prev) => prev + `\nDevice ID: ${validation.deviceId}`)

      if (!validation.isValid) {
        Alert.alert("Device Not Authorized", validation.message, [
          {
            text: "Contact Admin",
            onPress: () => {
              // You can add contact admin functionality here
              Alert.alert("Contact Admin", "Please contact your administrator to reset your device registration.")
            },
          },
          {
            text: "Logout",
            style: "destructive",
            onPress: async () => {
              await supabase.auth.signOut()
              router.replace("/login")
            },
          },
        ])
        return
      }

      // If device is valid, fetch student data
      await fetchStudentData(userId)
    } catch (error) {
      console.error("Error in validateDeviceAndFetchStudent:", error)
      setDebugInfo((prev) => prev + `\nError in device validation: ${error}`)
      Alert.alert("Error", "Failed to validate device. Please try again.")
    }
  }

  const fetchStudentData = async (userId: string) => {
    try {
      setDebugInfo((prev) => prev + `\nFetching student data for user: ${userId}`)

      const { data: studentData, error } = await supabase.from("students").select("*").eq("user_id", userId).single()

      if (error) {
        console.error("Error fetching student data:", error)
        setDebugInfo((prev) => prev + `\nError fetching student data: ${error.message}`)
        Alert.alert("Error", "Could not fetch student information. Please contact admin.")
        return
      }

      if (studentData) {
        setStudent(studentData)
        setDebugInfo((prev) => prev + `\nStudent data loaded: ${studentData.roll_number}`)
        console.log("Student data loaded:", studentData)
      } else {
        setDebugInfo((prev) => prev + `\nNo student record found for user: ${userId}`)
        Alert.alert("Error", "No student record found. Please contact admin.")
      }
    } catch (error) {
      console.error("Error in fetchStudentData:", error)
      setDebugInfo((prev) => prev + `\nError in fetchStudentData: ${error}`)
    }
  }

  const startBroadcasting = async () => {
    if (!deviceValidation?.isValid) {
      Alert.alert("Device Not Authorized", "This device is not authorized for attendance. Please contact admin.")
      return
    }

    if (!permissionsGranted) {
      const granted = await checkAndRequestPermissions()
      if (!granted) {
        Alert.alert(
          "Permissions Required",
          "Please grant the required permissions in your device settings to use this feature.",
        )
        return
      }
      setPermissionsGranted(granted)
    }

    if (!student?.roll_number) {
      Alert.alert("Error", "Student roll number not found. Please contact admin.")
      return
    }

    try {
      // First stop any existing broadcasting
      await stopBroadcasting()

      setDebugInfo((prev) => prev + "\nStarting attendance broadcasting...")
      setBroadcasting(true)

      // Use roll number as the service ID and name
      const serviceId = `attendance_${student.roll_number}`
      const displayName = `Student_${student.roll_number}`

      setDebugInfo((prev) => prev + `\nUsing service ID: ${serviceId}`)
      setDebugInfo((prev) => prev + `\nUsing display name: ${displayName}`)

      // Start advertising with roll number
      setTimeout(async () => {
        try {
          console.log("Starting advertising with roll number:", student.roll_number)
          setDebugInfo((prev) => prev + `\nStarting advertising with roll number: ${student.roll_number}`)

          const advertisePeerId = await NearbyConnections.startAdvertise(displayName)
          setMyPeerId(advertisePeerId)
          console.log("Started advertising with peerId:", advertisePeerId)
          setDebugInfo((prev) => prev + `\nStarted advertising with peerId: ${advertisePeerId}`)

          // Start discovery to find lecturers
          setTimeout(async () => {
            try {
              console.log("Starting discovery for lecturers...")
              setDebugInfo((prev) => prev + `\nStarting discovery for lecturers...`)

              await NearbyConnections.startDiscovery(serviceId)
              console.log("Discovery started successfully")
              setDebugInfo((prev) => prev + `\nDiscovery started successfully`)

              Alert.alert("Broadcasting Started", `Broadcasting attendance with roll number: ${student.roll_number}`)
            } catch (discoveryError) {
              console.error("Error starting discovery:", discoveryError)
              setDebugInfo((prev) => prev + `\nError starting discovery: ${discoveryError}`)
            }
          }, 1000)
        } catch (advertiseError) {
          console.error("Error starting advertising:", advertiseError)
          setDebugInfo((prev) => prev + `\nError starting advertising: ${advertiseError}`)
          setBroadcasting(false)
          Alert.alert("Error", "Failed to start broadcasting. Please try again.")
        }
      }, 1000)
    } catch (error) {
      console.error("Error in startBroadcasting:", error)
      setDebugInfo((prev) => prev + `\nError in startBroadcasting: ${error}`)
      setBroadcasting(false)
      Alert.alert("Error", "Failed to start attendance broadcasting")
    }
  }

  const stopBroadcasting = async () => {
    try {
      setDebugInfo((prev) => prev + `\nStopping broadcasting...`)

      try {
        await NearbyConnections.stopAdvertise()
        console.log("Advertising stopped")
        setDebugInfo((prev) => prev + `\nAdvertising stopped`)
      } catch (advertiseError) {
        console.error("Error stopping advertising:", advertiseError)
        setDebugInfo((prev) => prev + `\nError stopping advertising: ${advertiseError}`)
      }

      try {
        await NearbyConnections.stopDiscovery()
        console.log("Discovery stopped")
        setDebugInfo((prev) => prev + `\nDiscovery stopped`)
      } catch (discoveryError) {
        console.error("Error stopping discovery:", discoveryError)
        setDebugInfo((prev) => prev + `\nError stopping discovery: ${discoveryError}`)
      }

      setBroadcasting(false)
      Alert.alert("Broadcasting Stopped", "Attendance broadcasting has been stopped.")
    } catch (error) {
      console.error("Error in stopBroadcasting:", error)
      setDebugInfo((prev) => prev + `\nError in stopBroadcasting: ${error}`)
    }
  }

  const handleAcceptConnection = async (peerId: string) => {
    try {
      setDebugInfo((prev) => prev + `\nAccepting connection from: ${peerId}`)
      await NearbyConnections.acceptConnection(peerId)
      console.log("Connection accepted")
    } catch (error) {
      console.error("Error accepting connection:", error)
      setDebugInfo((prev) => prev + `\nError accepting connection: ${error}`)
      Alert.alert("Error", "Failed to accept connection")
    }
  }

  const handleRejectConnection = async (peerId: string) => {
    try {
      setDebugInfo((prev) => prev + `\nRejecting connection from: ${peerId}`)
      await NearbyConnections.rejectConnection(peerId)
    } catch (error) {
      console.error("Error rejecting connection:", error)
      setDebugInfo((prev) => prev + `\nError rejecting connection: ${error}`)
    }
  }

  const toggleDrawer = () => {
    if (global.toggleDrawer) {
      global.toggleDrawer()
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    )
  }

  if (!user) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>No user session. Redirecting to login...</ThemedText>
      </ThemedView>
    )
  }

  if (!hasPermissions) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.permissionContainer}>
          <ThemedText style={styles.permissionTitle}>Permissions Required</ThemedText>
          <ThemedText style={styles.permissionText}>
            This app requires Bluetooth and Location permissions to broadcast attendance.
          </ThemedText>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={async () => {
              const granted = await checkAndRequestPermissions()
              setHasPermissions(granted)
            }}
          >
            <ThemedText style={styles.permissionButtonText}>Grant Permissions</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    )
  }

  // Show device validation error
  if (deviceValidation && !deviceValidation.isValid) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={64} color="#EF4444" />
          <ThemedText style={styles.errorTitle}>Device Not Authorized</ThemedText>
          <ThemedText style={styles.errorText}>{deviceValidation.message}</ThemedText>
          <View style={styles.errorButtons}>
            <TouchableOpacity
              style={styles.contactButton}
              onPress={() => {
                Alert.alert("Contact Admin", "Please contact your administrator to reset your device registration.")
              }}
            >
              <ThemedText style={styles.contactButtonText}>Contact Admin</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={async () => {
                await supabase.auth.signOut()
                router.replace("/login")
              }}
            >
              <ThemedText style={styles.logoutButtonText}>Logout</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    )
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header with menu button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={toggleDrawer}>
          <Ionicons name="menu" size={24} color={colorScheme === "dark" ? "#fff" : "#000"} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Student Dashboard</ThemedText>
        {deviceValidation?.isValid && (
          <View style={styles.deviceStatus}>
            <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
          </View>
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.welcomeContainer}>
          <ThemedText type="title">Welcome, Student!</ThemedText>
          {user?.email && <ThemedText type="default">Logged in as: {user.email}</ThemedText>}
          {student && (
            <View style={styles.studentInfo}>
              <ThemedText style={styles.studentName}>Name: {student.name}</ThemedText>
              <ThemedText style={styles.rollNumber}>Roll Number: {student.roll_number}</ThemedText>
              <ThemedText style={styles.year}>Year: {student.current_year}</ThemedText>
              {deviceValidation?.deviceId && (
                <ThemedText style={styles.deviceId}>Device: {deviceValidation.deviceId.substring(0, 8)}...</ThemedText>
              )}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.attendanceButton, broadcasting && styles.stopButton]}
          onPress={broadcasting ? stopBroadcasting : startBroadcasting}
          activeOpacity={0.7}
          disabled={!student || !deviceValidation?.isValid}
        >
          <Ionicons name={broadcasting ? "stop-circle" : "radio"} size={24} color="#ffffff" style={styles.buttonIcon} />
          <ThemedText style={styles.attendanceButtonText}>
            {broadcasting ? "Stop Broadcasting" : "Give Attendance"}
          </ThemedText>
        </TouchableOpacity>

        {broadcasting && (
          <View style={styles.broadcastingStatus}>
            <Ionicons name="radio" size={20} color="#22C55E" style={styles.statusIcon} />
            <ThemedText style={styles.broadcastingText}>
              Broadcasting attendance with roll number: {student?.roll_number}
            </ThemedText>
          </View>
        )}

        {/* Debug Info */}
        {__DEV__ && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugTitle}>Debug Info:</Text>
            <ScrollView style={styles.debugScroll} nestedScrollEnabled>
              <Text style={styles.debugText}>{debugInfo}</Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    flex: 1,
  },
  deviceStatus: {
    marginLeft: 10,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  welcomeContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  studentInfo: {
    marginTop: 15,
    padding: 15,
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
    width: "100%",
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 5,
  },
  rollNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#7C3AED",
    marginBottom: 5,
  },
  year: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 5,
  },
  deviceId: {
    fontSize: 12,
    opacity: 0.6,
    fontFamily: "monospace",
  },
  attendanceButton: {
    flexDirection: "row",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    backgroundColor: "#7C3AED",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stopButton: {
    backgroundColor: "#EF4444",
  },
  buttonIcon: {
    marginRight: 10,
  },
  attendanceButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  broadcastingStatus: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    marginBottom: 15,
  },
  statusIcon: {
    marginRight: 10,
  },
  broadcastingText: {
    color: "#22C55E",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 16,
    textAlign: "center",
    color: "#EF4444",
  },
  errorText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 24,
  },
  errorButtons: {
    flexDirection: "row",
    gap: 15,
  },
  contactButton: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  contactButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  debugContainer: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  debugTitle: {
    color: "#F59E0B",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  debugScroll: {
    maxHeight: 150,
  },
  debugText: {
    color: "#4ADE80",
    fontFamily: "monospace",
    fontSize: 12,
  },
})
