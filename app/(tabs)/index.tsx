"use client"

import type { User } from "@supabase/supabase-js"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from "react-native"

import { ThemedText } from "@/components/ThemedText"
import { ThemedView } from "@/components/ThemedView"
import { Colors } from "@/constants/Colors"; // For button colors
import { useColorScheme } from "@/hooks/useColorScheme"
import { supabase } from "@/lib/supabase"

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
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
      } else {
        router.replace("/login")
      }
      setLoading(false)
    }

    fetchSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setLoading(false) // Stop loading if user logs out
        router.replace("/login")
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      Alert.alert("Logout Error", error.message)
    }
    // The onAuthStateChange listener will handle navigation to /login
    setLoading(false)
  }

  const handleGiveAttendance = () => {
    // Placeholder for attendance logic
    // You might navigate to another screen e.g. router.push('/class');
    Alert.alert("Attendance", "Give Attendance button pressed!")
    console.log("Give attendance pressed for user:", user?.email)
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? "light"].tint} />
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    )
  }

  if (!user) {
    // This case should ideally be handled by redirection,
    // but as a fallback:
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>No user session. Redirecting to login...</ThemedText>
      </ThemedView>
    )
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerContainer}>
        <ThemedText type="title">Welcome, Student!</ThemedText>
        {user?.email && <ThemedText type="default">Logged in as: {user.email}</ThemedText>}
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: Colors[colorScheme ?? "light"].tint }]}
        onPress={handleGiveAttendance}
        activeOpacity={0.7}
      >
        <ThemedText style={styles.buttonText}>Give Attendance</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout} activeOpacity={0.7}>
        <ThemedText style={[styles.buttonText, styles.logoutButtonText]}>Logout</ThemedText>
      </TouchableOpacity>
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
    padding: 20,
    justifyContent: "center", // Center content vertically
    alignItems: "center", // Center content horizontally
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    width: "80%", // Make buttons take more width
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: "#fff", // Default text color for primary button
    fontSize: 16,
    fontWeight: "bold",
  },
  logoutButton: {
    backgroundColor: "#FF3B30", // A common color for destructive actions
  },
  logoutButtonText: {
    color: "#fff", // Ensure text is visible on logout button
  },
})
