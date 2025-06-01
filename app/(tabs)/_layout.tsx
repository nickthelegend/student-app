import { Tabs } from "expo-router"
import { Platform } from "react-native"

import { HapticTab } from "@/components/HapticTab"
import { IconSymbol } from "@/components/ui/IconSymbol"; // Ensure this path is correct
import TabBarBackground from "@/components/ui/TabBarBackground"; // Ensure this path is correct
import { Colors } from "@/constants/Colors"
import { useColorScheme } from "@/hooks/useColorScheme"

export default function TabLayout() {
  const colorScheme = useColorScheme()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: (
            { color, focused }, // Added focused prop
          ) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      {/* Explore screen removed */}
      {/* 
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => ( // Added focused prop
            <IconSymbol size={28} name="paperplane.fill" color={color} />
          ),
        }}
      /> 
      */}
    </Tabs>
  )
}
