export const PEDIDO_SELECT = `
  SELECT p.*,
         m.numero AS mesa_numero,
         u.nombre AS mesero_nombre,
         COALESCE(
           json_agg(
             json_build_object(
               'id', d.id,
               'id_producto', d.id_producto,
               'cantidad', d.cantidad,
               'estado_cocina', d.estado_cocina,
               'destino_servicio', d.destino_servicio,
               'notas', d.notas,
               'variante', d.variante,
               'precio_unitario', d.precio_unitario,
               'producto_nombre', pr.nombre,
               'categoria', pr.categoria
             ) ORDER BY d.created_at
           ) FILTER (WHERE d.id IS NOT NULL),
           '[]'
         ) AS detalles
  FROM pedidos p
  LEFT JOIN mesas m ON m.id = p.id_mesa
  LEFT JOIN usuarios u ON u.id = p.id_usuario
  LEFT JOIN detalle_pedidos d ON d.id_pedido = p.id
  LEFT JOIN productos pr ON pr.id = d.id_producto
`;
