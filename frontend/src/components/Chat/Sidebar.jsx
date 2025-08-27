import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import api from "../../utils/api";
import { getSocket } from "../../utils/socket";
import UserDashboard from "../UserDashboard";
import AIAssistant from "../AIAssistant";

const UserListItem = React.memo(({ user, setActiveTab }) => {
  const lastSeenTime = user.lastSeen ? new Date(user.lastSeen).toLocaleTimeString() : "Never";
  
  return (
    <Link
      to={`/chat/${user._id}`}
      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
      onClick={() => setActiveTab("users")}
    >
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div 
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
            user.online ? "bg-green-500" : "bg-gray-400"
          }`}
          aria-label={user.online ? "Online" : "Offline"}
        />
      </div>
      <div className="ml-3 flex-1">
        <p className="font-medium">{user.username}</p>
        <p className="text-xs text-gray-500">
          {user.online ? "Online" : `Last seen ${lastSeenTime}`}
        </p>
        {user.bio && (
          <p className="text-xs text-gray-400 mt-1 truncate">
            {user.bio}
          </p>
        )}
      </div>
    </Link>
  );
});

UserListItem.propTypes = {
  user: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    online: PropTypes.bool,
    lastSeen: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(Date)
    ]),
    bio: PropTypes.string
  }).isRequired,
  setActiveTab: PropTypes.func.isRequired
};

const RoomListItem = React.memo(({ room, setActiveTab }) => (
  <Link
    to={`/room/${room._id}`}
    className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
    onClick={() => setActiveTab("rooms")}
  >
    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-5 w-5" 
        viewBox="0 0 20 20" 
        fill="currentColor"
        aria-hidden="true"
      >
        <path 
          fillRule="evenodd" 
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" 
          clipRule="evenodd" 
        />
      </svg>
    </div>
    <div className="ml-3">
      <p className="font-medium">{room.name}</p>
      <p className="text-xs text-gray-500 truncate">{room.description}</p>
    </div>
  </Link>
));

RoomListItem.propTypes = {
  room: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string
  }).isRequired,
  setActiveTab: PropTypes.func.isRequired
};

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
  </div>
);

const ErrorBanner = ({ message }) => (
  <div className="bg-yellow-100 text-yellow-800 p-2 text-sm">
    {message}
  </div>
);

ErrorBanner.propTypes = {
  message: PropTypes.string.isRequired
};

const UserProfile = ({ currentUser, onLogout, onOpenDashboard }) => (
  <div className="p-4 border-b border-gray-200">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center space-x-3">
        <button
          onClick={onOpenDashboard}
          className="flex items-center space-x-3 hover:bg-gray-100 p-2 rounded-lg transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
            {currentUser?.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{currentUser?.username}</p>
            <p className="text-xs text-gray-500">
              {currentUser?.online ? "Online" : "Offline"}
            </p>
          </div>
        </button>
      </div>
      <button
        onClick={onLogout}
        className="w-17 bg-red-600 hover:bg-red-700 text-white py-1 rounded-lg font-medium"
        aria-label="Logout"
      >
        Logout
      </button>
    </div>
  </div>
);

UserProfile.propTypes = {
  currentUser: PropTypes.shape({
    username: PropTypes.string,
    online: PropTypes.bool
  }),
  onLogout: PropTypes.func,
  onOpenDashboard: PropTypes.func
};

const AIAssistantButton = ({ onOpenAI }) => (
  <div className="px-4 py-2">
    <button
      onClick={onOpenAI}
      className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      <span>AI Assistant</span>
    </button>
  </div>
);

AIAssistantButton.propTypes = {
  onOpenAI: PropTypes.func.isRequired
};

const SearchBar = ({ searchQuery, setSearchQuery }) => (
  <div className="px-4 py-3">
    <input
      type="text"
      placeholder="Search users or rooms..."
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      aria-label="Search users and rooms"
    />
  </div>
);

SearchBar.propTypes = {
  searchQuery: PropTypes.string.isRequired,
  setSearchQuery: PropTypes.func.isRequired
};

const TabButtons = ({ activeTab, setActiveTab }) => (
  <div className="flex border-b border-gray-200">
    <button
      className={`flex-1 py-3 font-medium ${
        activeTab === "users" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
      }`}
      onClick={() => setActiveTab("users")}
      aria-current={activeTab === "users" ? "page" : undefined}
    >
      Users
    </button>
    <button
      className={`flex-1 py-3 font-medium ${
        activeTab === "rooms" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
      }`}
      onClick={() => setActiveTab("rooms")}
      aria-current={activeTab === "rooms" ? "page" : undefined}
    >
      Rooms
    </button>
  </div>
);

TabButtons.propTypes = {
  activeTab: PropTypes.oneOf(["users", "rooms"]).isRequired,
  setActiveTab: PropTypes.func.isRequired
};

const CreateRoomButton = ({ onCreateRoom }) => (
  <div className="p-4 border-t border-gray-200">
    <button 
      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium"
      onClick={onCreateRoom}
    >
      Create New Room
    </button>
  </div>
);

CreateRoomButton.propTypes = {
  onCreateRoom: PropTypes.func.isRequired
};

const Sidebar = ({ activeTab, setActiveTab, currentUser, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDashboard, setShowDashboard] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const filteredUsers = useMemo(() => (
    users.filter(user =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ), [users, searchQuery]);

  const filteredRooms = useMemo(() => (
    rooms.filter(room =>
      room.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ), [rooms, searchQuery]);

  const handleUserStatusChange = useCallback((userId, online) => {
    setUsers(prev => prev.map(user => 
      user._id === userId ? { 
        ...user, 
        online, 
        lastSeen: online ? null : new Date() 
      } : user
    ));
  }, []);

  const handleCreateRoom = useCallback(() => {
    navigate('/create-room');
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;
    let socketCleanup = () => {};

    const fetchData = async () => {
      try {
        setLoading(true);
        const [usersRes, roomsRes] = await Promise.all([
          api.get("/users"),
          api.get("/rooms")
        ]);

        if (isMounted) {
          setUsers(usersRes.data);
          setRooms(roomsRes.data);
        }
      } catch (err) {
        if (isMounted) {
          if (err.response?.status === 401) {
            navigate("/login");
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const setupSocket = async () => {
      try {
        const socket = await getSocket();
        if (!socket || !isMounted) return;

        socket.on("userOnline", (userId) => 
          handleUserStatusChange(userId, true)
        );
        socket.on("userOffline", (userId) => 
          handleUserStatusChange(userId, false)
        );

        socketCleanup = () => {
          socket.off("userOnline");
          socket.off("userOffline");
        };
      } catch (err) {
        // Silently handle socket connection errors
        console.warn("Socket connection error:", err);
      }
    };

    fetchData();
    setupSocket();

    return () => {
      isMounted = false;
      socketCleanup();
    };
  }, [navigate, handleUserStatusChange]);

  const userListItems = useMemo(() => (
    filteredUsers.map(user => (
      <UserListItem 
        key={user._id}
        user={user}
        setActiveTab={setActiveTab}
      />
    ))
  ), [filteredUsers, setActiveTab]);

  const roomListItems = useMemo(() => (
    filteredRooms.map(room => (
      <RoomListItem
        key={room._id}
        room={room}
        setActiveTab={setActiveTab}
      />
    ))
  ), [filteredRooms, setActiveTab]);

  if (loading) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      <UserProfile 
        currentUser={currentUser} 
        onLogout={onLogout} 
        onOpenDashboard={() => setShowDashboard(true)}
      />
      
      {showDashboard && (
        <UserDashboard
          currentUser={currentUser}
          onClose={() => setShowDashboard(false)}
          onLogout={onLogout}
        />
      )}
      
      <AIAssistantButton onOpenAI={() => setShowAIAssistant(true)} />
      
      <SearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <TabButtons 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <div className="flex-1 overflow-y-auto">
        {activeTab === "users" ? (
          <div className="divide-y divide-gray-100">
            {userListItems.length > 0 ? userListItems : (
              <p className="p-4 text-center text-gray-500">No users found</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {roomListItems.length > 0 ? roomListItems : (
              <p className="p-4 text-center text-gray-500">No rooms found</p>
            )}
          </div>
        )}
      </div>

      <CreateRoomButton onCreateRoom={handleCreateRoom} />
      
      {showAIAssistant && (
        <>
          {console.log('Rendering AI Assistant with currentUser:', currentUser)}
          <AIAssistant
            currentUser={currentUser}
            onClose={() => setShowAIAssistant(false)}
          />
        </>
      )}
    </div>
  );
};

Sidebar.propTypes = {
  activeTab: PropTypes.oneOf(["users", "rooms"]).isRequired,
  setActiveTab: PropTypes.func.isRequired,
  currentUser: PropTypes.shape({
    username: PropTypes.string,
    _id: PropTypes.string,
    online: PropTypes.bool
  }),
  onLogout: PropTypes.func
};

export default React.memo(Sidebar);