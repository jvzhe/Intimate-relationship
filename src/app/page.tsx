import { WeChatInterface } from "@/components/WeChatInterface";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-200 flex items-center justify-center">
      {/* 
        Container wrapper to simulate mobile view on desktop. 
        On mobile, WeChatInterface takes full width/height.
      */}
      <div className="w-full h-full md:h-[800px] md:w-[400px]">
        <WeChatInterface />
      </div>
    </main>
  );
}
