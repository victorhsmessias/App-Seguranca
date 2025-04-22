import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Corrigir ícones do Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Componente para atualizar a visualização do mapa
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, 15);
  return null;
}

function Map({ location }) {
  if (!location) {
    return (
      <div className="text-center p-6 h-64 flex flex-col items-center justify-center bg-blue-50">
        <svg className="w-16 h-16 text-blue-300 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        <p className="text-gray-500">Mapa será exibido após compartilhar localização</p>
      </div>
    );
  }

  const position = [location.lat, location.lng];
  
  return (
    <div className="h-64">
      <MapContainer 
        center={position} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            Sua localização atual <br />
            Precisão: {location.accuracy ? `±${Math.round(location.accuracy)}m` : "N/A"}
          </Popup>
        </Marker>
        <ChangeView center={position} />
      </MapContainer>
    </div>
  );
}

export default Map;