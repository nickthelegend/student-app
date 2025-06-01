"use client"
import { ThemedText } from "@/components/ThemedText"
import { ThemedView } from "@/components/ThemedView"
import { useColorScheme } from "@/hooks/useColorScheme"
import { supabase } from "@/lib/supabase"
import { FontAwesome5, Ionicons, MaterialIcons } from "@expo/vector-icons"
import type { User } from "@supabase/supabase-js"
import { LinearGradient } from "expo-linear-gradient"
import { Tabs, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from "react-native"
import { Drawer } from "react-native-drawer-layout"

const { width } = Dimensions.get("window")

interface Student {
  id: string
  user_id: string
  name: string
  email: string
  roll_number: string
  program_id: string
  current_year: number
}

export default function TabLayout() {
  const colorScheme = useColorScheme()
  const router = useRouter()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [student, setStudent] = useState<Student | null>(null)

  // Get user info and student data
  useEffect(() => {
    const fetchUserData = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (error) {
        console.error("Error fetching user:", error)
        return
      }

      if (user) {
        setUser(user)
        // Fetch student data
        const { data: studentData, error: studentError } = await supabase
          .from("students")
          .select("*")
          .eq("user_id", user.id)
          .single()

        if (studentError) {
          console.error("Error fetching student data:", studentError)
        } else {
          setStudent(studentData)
        }
      }
    }

    fetchUserData()

    // Make toggleDrawer available globally
    global.toggleDrawer = () => setIsDrawerOpen((prev) => !prev)

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
      } else {
        setUser(null)
        setStudent(null)
      }
    })

    return () => {
      delete global.toggleDrawer
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            setIsDrawerOpen(false)
            await supabase.auth.signOut()
            router.replace("/login")
          } catch (error) {
            console.error("Error signing out:", error)
            Alert.alert("Error", "Failed to logout. Please try again.")
          }
        },
      },
    ])
  }

  const handleProfile = () => {
    setIsDrawerOpen(false)
    // Navigate to profile (you can implement this later)
    Alert.alert("Profile", "Profile screen coming soon!")
  }

  const handleSettings = () => {
    setIsDrawerOpen(false)
    // Navigate to settings (you can implement this later)
    Alert.alert("Settings", "Settings screen coming soon!")
  }

  const renderDrawerContent = () => {
    return (
      <ThemedView style={styles.drawerContainer}>
        <LinearGradient
          colors={["#4776E6", "#8E54E9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.drawerHeader}
        >
          <View style={styles.profileImageContainer}>
            <FontAwesome5 name="user-graduate" size={40} color="#FFFFFF" />
          </View>
          <ThemedText style={styles.userName}>{student?.name || user?.email || "Student"}</ThemedText>
          {student && (
            <>
              <ThemedText style={styles.userRole}>Roll No: {student.roll_number}</ThemedText>
              <ThemedText style={styles.userYear}>Year {student.current_year}</ThemedText>
            </>
          )}
        </LinearGradient>

        <ThemedView style={styles.drawerContent}>
          <TouchableOpacity style={styles.drawerItem} onPress={handleProfile}>
            <Ionicons name="person" size={22} color="#555" style={styles.drawerItemIcon} />
            <ThemedText style={styles.drawerItemText}>Profile</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.drawerItem} onPress={handleSettings}>
            <Ionicons name="settings" size={22} color="#555" style={styles.drawerItemIcon} />
            <ThemedText style={styles.drawerItemText}>Settings</ThemedText>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={[styles.drawerItem, styles.logoutItem]} onPress={handleLogout}>
            <MaterialIcons name="logout" size={22} color="#EF4444" style={styles.drawerItemIcon} />
            <ThemedText style={[styles.drawerItemText, styles.logoutText]}>Logout</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <View style={styles.drawerFooter}>
          <ThemedText style={styles.footerText}>Student Attendance App</ThemedText>
          <ThemedText style={styles.versionText}>Version 1.0.0</ThemedText>
        </View>
      </ThemedView>
    )
  }

  return (
    <Drawer
      open={isDrawerOpen}
      onOpen={() => setIsDrawerOpen(true)}
      onClose={() => setIsDrawerOpen(false)}
      renderDrawerContent={renderDrawerContent}
      drawerType="front"
      drawerStyle={{ width: "75%" }}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: "#8E54E9",
          tabBarInactiveTintColor: "#888888",
          tabBarStyle: {
            backgroundColor: colorScheme === "dark" ? "#1a1a1a" : "#FFFFFF",
            borderTopColor: colorScheme === "dark" ? "#333" : "#E0E0E0",
            height: 70,
            paddingBottom: 10,
            paddingTop: 10,
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
          },
          tabBarItemStyle: {
            height: 50,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "500",
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.tabIconContainer, focused && styles.activeTabIconContainer]}>
                <Ionicons name="home" size={focused ? 26 : 22} color={color} />
              </View>
            ),
            tabBarLabel: "Home",
          }}
        />
      </Tabs>
    </Drawer>
  )
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  drawerHeader: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingBottom: 30,
  },
  profileImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  userRole: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 5,
    fontWeight: "600",
  },
  userYear: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 2,
  },
  drawerContent: {
    flex: 1,
    paddingTop: 20,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 5,
  },
  drawerItemIcon: {
    marginRight: 15,
  },
  drawerItemText: {
    fontSize: 16,
    color: "#555",
  },
  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginVertical: 10,
    marginHorizontal: 20,
  },
  logoutItem: {
    marginTop: 10,
  },
  logoutText: {
    color: "#EF4444",
    fontWeight: "600",
  },
  drawerFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  versionText: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: 30,
    width: 60,
    borderRadius: 12,
  },
  activeTabIconContainer: {
    backgroundColor: "rgba(142, 84, 233, 0.1)",
  },
})

// Declare global type for TypeScript
declare global {
  var toggleDrawer: () => void
}
